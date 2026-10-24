import type { GameAction, GameState } from '@optcg/core';
import type { Puzzle } from './schema.js';
import {
  PLAYER,
  buildState,
  canonicalActionKey,
  isWin,
  optionsFor,
  possibleAnswers,
  runAction,
  stateHash,
  type Answer,
} from './runner.js';

const INF = Number.POSITIVE_INFINITY;

/** Attacks and abilities first: wins come from damage, so they prune the search fastest. */
const ACTION_ORDER: Record<GameAction['kind'], number> = {
  declareAttack: 0,
  activateAbility: 1,
  playEvent: 2,
  playCharacter: 3,
  playStage: 4,
  attachDon: 5,
  endTurn: 6,
};

const ordered = (actions: GameAction[]): GameAction[] =>
  [...actions].sort((a, b) => ACTION_ORDER[a.kind] - ACTION_ORDER[b.kind]);

/**
 * Canonical form of a line: runs of consecutive `attachDon` moves are sorted, so "attach to A
 * then B" and "attach to B then A" — which commute — read as the same line. Nothing else is
 * reordered: attacks, plays and ability activations are order-sensitive.
 */
export const canonicalLine = (line: readonly string[]): string => {
  const out = [...line];
  let i = 0;
  while (i < out.length) {
    if (out[i]!.startsWith('attachDon:')) {
      let j = i;
      while (j < out.length && out[j]!.startsWith('attachDon:')) j += 1;
      const run = out.slice(i, j).sort();
      out.splice(i, j - i, ...run);
      i = j;
    } else {
      i += 1;
    }
  }
  return out.join(' | ');
};

/** One player move as realized against the adversarial defence. */
export interface Realized {
  /** Canonical action key, suffixed with the player's sub-choice indices when they branched. */
  readonly moveKey: string;
  /** Total actions including this one to a guaranteed win, or Infinity. */
  readonly value: number;
  /** Post-move state under the realized defence; null when the move ended the game. */
  readonly state: GameState | null;
}

/**
 * Minimax over the puzzle's game tree.
 *
 * The player minimises actions-to-win; the opponent's decisions (blockers, counters, trigger
 * options, orderings) are branched universally — a position only counts as won when every
 * defence loses. The realized defence (what the API plays back at the user) is the argmax
 * branch with first-index tie-break, so solver and server agree exactly.
 */
export class Solver {
  /** finite number = exact minimal actions to win; `{infBudget}` = proven unwinnable within that budget. */
  private readonly memo = new Map<string, number | { readonly infBudget: number }>();
  nodes = 0;

  constructor(private readonly maxNodes = 150_000) {}

  private tick(): void {
    this.nodes += 1;
    if (this.nodes > this.maxNodes) {
      throw new Error(
        `Solver exceeded ${this.maxNodes} engine calls — the position is too sprawling to verify, which is itself a sign the puzzle needs tightening`,
      );
    }
  }

  /** Minimal actions to a guaranteed win within `budget`, or Infinity. */
  minWin(state: GameState, budget: number): number {
    if (state.result) return isWin(state.result) ? 0 : INF;
    if (budget <= 0) return INF;
    const hash = stateHash(state);
    const cached = this.memo.get(hash);
    if (typeof cached === 'number') return cached <= budget ? cached : INF;
    if (cached && cached.infBudget >= budget) return INF;

    let best = INF;
    for (const action of ordered(optionsFor(state))) {
      if (action.kind === 'endTurn') continue;
      // Only look for strictly better lines than the best already found.
      const cap = Number.isFinite(best) ? Math.min(budget, best - 1) : budget;
      if (cap <= 0) break;
      const value = this.chainValue(state, action, [], cap);
      if (value < best) best = value;
      if (best === 1) break;
    }

    if (Number.isFinite(best)) {
      // A finite value is the global minimum: any shorter line would fit any budget that found this one.
      this.memo.set(hash, best);
    } else {
      const prev = this.memo.get(hash);
      const prevBudget = prev && typeof prev !== 'number' ? prev.infBudget : 0;
      this.memo.set(hash, { infBudget: Math.max(prevBudget, budget) });
    }
    return best;
  }

  /**
   * Value of playing `action` with the decision chain so far: the player's own sub-choices
   * minimise, the opponent's maximise. Finite result = win guaranteed on EVERY defence branch.
   */
  private chainValue(state: GameState, action: GameAction, answers: readonly Answer[], budget: number): number {
    this.tick();
    const outcome = runAction(state, action, answers);
    if (outcome.status === 'awaiting') {
      const options = possibleAnswers(outcome.request);
      const mine = outcome.request.player === PLAYER;
      let agg = mine ? INF : -1;
      for (const answer of options) {
        const value = this.chainValue(state, action, [...answers, answer], budget);
        if (mine) {
          if (value < agg) agg = value;
          if (agg === 1) break;
        } else {
          if (value > agg) agg = value;
          if (!Number.isFinite(agg)) break;
        }
      }
      return agg;
    }
    if (outcome.result) return isWin(outcome.result) ? 1 : INF;
    if (outcome.turnEnded) return INF;
    return 1 + this.minWin(outcome.state, budget - 1);
  }

  private bestDefenceIndex(
    state: GameState,
    action: GameAction,
    answers: readonly Answer[],
    options: readonly Answer[],
    budget: number,
  ): number {
    let bestIndex = 0;
    let bestValue = -1;
    for (let i = 0; i < options.length; i += 1) {
      const value = this.chainValue(state, action, [...answers, options[i]!], budget);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
      if (!Number.isFinite(bestValue)) break;
    }
    return bestIndex;
  }

  /**
   * The adversarial defence for the pending decision of `action` after `answers`: the branch
   * that maximises the player's remaining work (first index on ties). The API replays exactly
   * this policy, so what the solver proved is what the player faces.
   */
  defend(state: GameState, action: GameAction, answers: readonly Answer[], budget: number): Answer {
    const outcome = runAction(state, action, answers);
    if (outcome.status !== 'awaiting') throw new Error('No pending decision to defend');
    if (outcome.request.player === PLAYER) throw new Error('Pending decision belongs to the player');
    const options = possibleAnswers(outcome.request);
    return options[this.bestDefenceIndex(state, action, answers, options, budget)]!;
  }

  /**
   * All realizations of one player action: branches over the player's own sub-choices, follows
   * the adversarial defence for the opponent's. Forced single-option player choices add no
   * suffix, so they never make two identical lines look distinct.
   */
  realize(state: GameState, action: GameAction, budget: number): Realized[] {
    return this.realizeStep(state, action, [], '', budget);
  }

  private realizeStep(
    state: GameState,
    action: GameAction,
    answers: readonly Answer[],
    suffix: string,
    budget: number,
  ): Realized[] {
    this.tick();
    const outcome = runAction(state, action, answers);
    if (outcome.status === 'awaiting') {
      const options = possibleAnswers(outcome.request);
      if (outcome.request.player === PLAYER) {
        if (options.length === 1) {
          return this.realizeStep(state, action, [...answers, options[0]!], suffix, budget);
        }
        const results: Realized[] = [];
        for (let i = 0; i < options.length; i += 1) {
          results.push(
            ...this.realizeStep(
              state,
              action,
              [...answers, options[i]!],
              `${suffix}/${outcome.request.type}:${i}`,
              budget,
            ),
          );
        }
        return results;
      }
      const index = this.bestDefenceIndex(state, action, answers, options, budget);
      return this.realizeStep(state, action, [...answers, options[index]!], suffix, budget);
    }
    const moveKey = canonicalActionKey(state, action) + suffix;
    if (outcome.result) {
      return [{ moveKey, value: isWin(outcome.result) ? 1 : INF, state: null }];
    }
    if (outcome.turnEnded) return [{ moveKey, value: INF, state: null }];
    return [{ moveKey, value: 1 + this.minWin(outcome.state, budget - 1), state: outcome.state }];
  }
}

export interface SolveOptions {
  readonly maxNodes?: number;
  /** Stop counting sub-optimal wins once this many distinct lines are found. */
  readonly suboptimalFloor?: number;
}

export interface SolveResult {
  /** Proven minimal action count, or null when no guaranteed win exists within maxActions. */
  readonly par: number | null;
  /** Distinct canonical minimal lines. Exactly one means the puzzle is sound. */
  readonly optimalLines: readonly (readonly string[])[];
  /** Distinct canonical winning lines longer than par, counted up to `suboptimalFloor`. */
  readonly suboptimalWins: number;
  readonly nodes: number;
}

export const solvePuzzle = (puzzle: Puzzle, options: SolveOptions = {}): SolveResult => {
  const solver = new Solver(options.maxNodes);
  const root = buildState(puzzle);
  const max = puzzle.maxActions;

  const par = solver.minWin(root, max);
  if (!Number.isFinite(par)) {
    return { par: null, optimalLines: [], suboptimalWins: 0, nodes: solver.nodes };
  }

  const optimal = new Map<string, readonly string[]>();
  const walkOptimal = (state: GameState, used: number, prefix: readonly string[]): void => {
    for (const action of ordered(optionsFor(state))) {
      if (action.kind === 'endTurn') continue;
      for (const move of solver.realize(state, action, max - used)) {
        if (used + move.value !== par) continue;
        const line = [...prefix, move.moveKey];
        if (move.state === null) optimal.set(canonicalLine(line), line);
        else walkOptimal(move.state, used + 1, line);
      }
    }
  };
  walkOptimal(root, 0, []);

  const floor = options.suboptimalFloor ?? 10;
  const suboptimal = new Set<string>();
  const walkAll = (state: GameState, used: number, prefix: readonly string[]): void => {
    if (suboptimal.size >= floor) return;
    if (max - used <= 0) return;
    for (const action of ordered(optionsFor(state))) {
      if (action.kind === 'endTurn') continue;
      for (const move of solver.realize(state, action, max - used)) {
        if (!Number.isFinite(move.value)) continue;
        const line = [...prefix, move.moveKey];
        if (move.state === null) {
          if (line.length > par) suboptimal.add(canonicalLine(line));
        } else {
          walkAll(move.state, used + 1, line);
        }
        if (suboptimal.size >= floor) return;
      }
    }
  };
  walkAll(root, 0, []);

  return {
    par,
    optimalLines: [...optimal.values()],
    suboptimalWins: suboptimal.size,
    nodes: solver.nodes,
  };
};
