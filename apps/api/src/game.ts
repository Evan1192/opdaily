import { buildView, type DecisionRequest, type GameState, type GameView } from '@optcg/core';
import {
  PLAYER,
  Solver,
  actionKey,
  buildState,
  isWin,
  optionsFor,
  possibleAnswers,
  runAction,
  type Answer,
  type Puzzle,
} from '@opdaily/puzzle';

/**
 * One completed player action: the key the client submitted plus the full decision chain as it
 * was resolved (the player's sub-choices and the adversarial defence interleaved). Replaying the
 * journal against the puzzle's initial state reproduces the position exactly — the engine is
 * deterministic and the puzzle pins all hidden information.
 */
export interface JournalEntry {
  readonly key: string;
  readonly answers: readonly Answer[];
}

/** The session's full stored play state. */
export interface Journal {
  readonly entries: readonly JournalEntry[];
  /** A mid-action player decision in flight: the action so far, awaiting one more choice. */
  readonly pending: JournalEntry | null;
}

export const emptyJournal: Journal = { entries: [], pending: null };

export interface PendingDecision {
  readonly request: DecisionRequest;
  /** Enumerated answers; the client replies with an index into this list. */
  readonly options: readonly Answer[];
}

export interface Position {
  readonly state: GameState;
  readonly pending: PendingDecision | null;
  readonly won: boolean;
  /** Turn ended, or the action budget ran out, without lethal. */
  readonly failed: boolean;
}

export class PuzzleGame {
  private readonly solver: Solver;
  private readonly root: GameState;

  constructor(readonly puzzle: Puzzle) {
    this.solver = new Solver();
    this.root = buildState(puzzle);
  }

  /**
   * The defence budget at a given line depth. It matches what the verifier proved: the solver
   * realized each move with `maxActions - used` remaining, so the server answering with the same
   * budget plays exactly the defence the uniqueness proof was computed against.
   */
  private budget(used: number): number {
    return Math.max(0, this.puzzle.maxActions - used);
  }

  /**
   * Drive one player action forward: opponent decisions are answered adversarially, player
   * decisions stop the drive and surface to the client. Returns the extended answer chain and
   * either a pending player decision or the completed outcome.
   */
  private drive(
    state: GameState,
    entry: JournalEntry,
    used: number,
  ):
    | { readonly kind: 'pending'; readonly answers: readonly Answer[]; readonly decision: PendingDecision }
    | { readonly kind: 'complete'; readonly answers: readonly Answer[]; readonly state: GameState; readonly turnEnded: boolean } {
    const action = optionsFor(state).find((a) => actionKey(a) === entry.key);
    if (!action) throw new IllegalActionError(entry.key);
    let answers: readonly Answer[] = entry.answers;
    for (;;) {
      const outcome = runAction(state, action, answers);
      if (outcome.status === 'complete') {
        return { kind: 'complete', answers, state: outcome.state, turnEnded: outcome.turnEnded };
      }
      if (outcome.request.player === PLAYER) {
        return {
          kind: 'pending',
          answers,
          decision: { request: outcome.request, options: possibleAnswers(outcome.request) },
        };
      }
      answers = [...answers, this.solver.defend(state, action, answers, this.budget(used))];
    }
  }

  /** Rebuild the position from a stored journal. Throws if the journal does not replay. */
  replay(journal: Journal): Position {
    let state = this.root;
    let won = false;
    let turnEnded = false;
    for (const [i, entry] of journal.entries.entries()) {
      if (won || turnEnded) throw new Error('Journal continues past the end of the game');
      const step = this.drive(state, entry, i);
      if (step.kind !== 'complete') throw new Error('Stored journal entry is incomplete');
      state = step.state;
      turnEnded = step.turnEnded;
      won = state.result !== null && isWin(state.result);
    }
    let pending: PendingDecision | null = null;
    if (journal.pending) {
      const step = this.drive(state, journal.pending, journal.entries.length);
      if (step.kind !== 'pending') throw new Error('Stored pending entry is actually complete');
      pending = step.decision;
    }
    const outOfActions = !won && journal.entries.length >= this.puzzle.maxActions;
    const failed = !won && (turnEnded || outOfActions);
    return { state, pending, won, failed };
  }

  /**
   * Apply one more step — either a fresh action (`{ key }`) or an answer to the pending player
   * decision (`{ choice }`). Returns the updated journal; replay it for the new position.
   */
  advance(journal: Journal, input: { key: string } | { choice: number }): Journal {
    const position = this.replay(journal);
    if (position.won || position.failed) throw new Error('Game is over; reset to try again');

    let entry: JournalEntry;
    if ('key' in input) {
      if (journal.pending) throw new Error('A decision is pending; answer it or undo');
      entry = { key: input.key, answers: [] };
    } else {
      if (!journal.pending || !position.pending) throw new Error('No decision is pending');
      const chosen = position.pending.options[input.choice];
      if (!chosen) throw new Error(`Choice index ${input.choice} out of range`);
      entry = { key: journal.pending.key, answers: [...journal.pending.answers, chosen] };
    }

    let state = this.root;
    for (const [i, done] of journal.entries.entries()) {
      const step = this.drive(state, done, i);
      if (step.kind !== 'complete') throw new Error('Stored journal entry is incomplete');
      state = step.state;
    }
    const step = this.drive(state, entry, journal.entries.length);
    if (step.kind === 'pending') {
      return { entries: journal.entries, pending: { key: entry.key, answers: step.answers } };
    }
    return {
      entries: [...journal.entries, { key: entry.key, answers: step.answers }],
      pending: null,
    };
  }

  /** Undo the pending decision if one exists, otherwise the last completed action. */
  undo(journal: Journal): Journal {
    if (journal.pending) return { entries: journal.entries, pending: null };
    if (journal.entries.length === 0) throw new Error('Nothing to undo');
    return { entries: journal.entries.slice(0, -1), pending: null };
  }

  /** The player-facing snapshot of a position: redacted view plus keyed legal actions. */
  snapshot(position: Position): {
    view: GameView;
    actions: { key: string; kind: string }[];
    pending: PendingDecision | null;
  } {
    const over = position.won || position.failed || position.state.result !== null;
    return {
      view: buildView(position.state, PLAYER),
      actions:
        over || position.pending
          ? []
          : optionsFor(position.state).map((a) => ({ key: actionKey(a), kind: a.kind })),
      pending: position.pending,
    };
  }
}

export class IllegalActionError extends Error {
  constructor(key: string) {
    super(`Action ${key} is not legal in this position`);
  }
}
