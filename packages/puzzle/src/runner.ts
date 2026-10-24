import { createHash } from 'node:crypto';
import {
  deserialize,
  getDefinition,
  legalActions,
  performAction,
  serialize,
  type DecisionRequest,
  type DecisionResponse,
  type GameAction,
  type GameResult,
  type GameState,
} from '@optcg/core';
import { scenario, type Scenario } from '@optcg/core/testing';
import type { Puzzle } from './schema.js';
import { toScenario } from './schema.js';
import { loadScripts, loadVendoredDefinitions } from './engine-data.js';

/** The puzzle player always occupies seat 0; `toScenario` forces `activePlayer: 0`. */
export const PLAYER = 0 as const;
export const OPPONENT = 1 as const;

/** Build the full scenario (state + side handles) for a parsed puzzle. */
export const buildScenario = (puzzle: Puzzle): Scenario =>
  scenario({ ...toScenario(puzzle), definitions: loadVendoredDefinitions(), scripts: loadScripts() });

/** Build just the game state for a parsed puzzle. */
export const buildState = (puzzle: Puzzle): GameState => buildScenario(puzzle).state;

/**
 * Exact state clone: serialize → structuredClone → deserialize.
 *
 * Unlike the sim's `fork()` this deliberately does NOT reshuffle hidden zones and does NOT
 * reseed the RNG — a puzzle pins all hidden information up front, so a clone must replay
 * identically to the original. Definitions and scripts are shared by reference (static data).
 */
export const cloneState = (state: GameState): GameState =>
  deserialize(structuredClone(serialize(state)), state.definitions, state.scripts);

/** Every legal action for the puzzle player, straight from the engine. */
export const optionsFor = (state: GameState): GameAction[] => legalActions(state, PLAYER);

/**
 * Stable identity for an action within one puzzle.
 *
 * Instance ids are deterministic (scenario mints `s0, s1, …` and every replay is exact), so
 * they are safe to key on. `attachDon` deliberately omits the DON!! id: `legalActions` only
 * ever offers the first active DON!!, and which physical die is attached is meaningless — keying
 * on it would make the same conceptual action change key as earlier attachments consume dice.
 */
export const actionKey = (action: GameAction): string => {
  switch (action.kind) {
    case 'playCharacter':
      return `playCharacter:${action.card}>${action.replaces ?? '-'}`;
    case 'playStage':
      return `playStage:${action.card}`;
    case 'playEvent':
      return `playEvent:${action.card}`;
    case 'attachDon':
      return `attachDon:${action.target}`;
    case 'activateAbility':
      return `activateAbility:${action.card}#${action.abilityKey}`;
    case 'declareAttack':
      return `declareAttack:${action.attacker}>${action.target}`;
    case 'endTurn':
      return 'endTurn';
  }
};

/**
 * Definition-level identity, used by the solver to treat lines that differ only in which
 * identical copy they touched as the same line.
 */
export const canonicalActionKey = (state: GameState, action: GameAction): string => {
  const def = (id: Parameters<typeof getDefinition>[1]) => getDefinition(state, id).id;
  switch (action.kind) {
    case 'playCharacter':
      return `playCharacter:${def(action.card)}>${action.replaces ? def(action.replaces) : '-'}`;
    case 'playStage':
      return `playStage:${def(action.card)}`;
    case 'playEvent':
      return `playEvent:${def(action.card)}`;
    case 'attachDon':
      return `attachDon:${def(action.target)}`;
    case 'activateAbility':
      return `activateAbility:${def(action.card)}#${action.abilityKey}`;
    case 'declareAttack':
      return `declareAttack:${def(action.attacker)}>${def(action.target)}`;
    case 'endTurn':
      return 'endTurn';
  }
};

/**
 * Hash of everything that can influence future play. The event log is excluded (it is an
 * append-only record, not an input), which lets the solver's memo table recognise transpositions
 * reached through different action orders.
 */
export const stateHash = (state: GameState): string => {
  const wire = { ...serialize(state), eventLog: [] };
  return createHash('sha1').update(JSON.stringify(wire)).digest('hex');
};

/**
 * A decision answer without its `requestId` — the runner fills ids in as requests arrive, so a
 * caller can describe a whole decision chain up front (or a stored journal can replay one).
 */
export type Answer =
  | { readonly type: 'ChooseBlocker'; readonly index: number | null }
  | { readonly type: 'CounterStep'; readonly index: number }
  | { readonly type: 'ChooseTargets'; readonly indices: readonly number[] }
  | { readonly type: 'ChooseOption'; readonly index: number }
  | { readonly type: 'ChooseOrder'; readonly order: readonly number[] };

export type RunOutcome =
  | {
      readonly status: 'complete';
      readonly state: GameState;
      readonly turnEnded: boolean;
      readonly result: GameResult | null;
    }
  /** The action needs one more answer than was supplied; re-run with the chain extended. */
  | { readonly status: 'awaiting'; readonly request: DecisionRequest };

const toResponse = (request: DecisionRequest, answer: Answer): DecisionResponse => {
  if (request.type !== answer.type) {
    throw new Error(`Answer type ${answer.type} does not match request ${request.type}`);
  }
  return { ...answer, requestId: request.requestId } as DecisionResponse;
};

/**
 * Apply one player action to a clone of `state`, answering every decision the engine raises
 * from the supplied chain. The input state is never mutated. If the chain runs out mid-action
 * the partial clone is discarded and the pending request returned — decision chains are short,
 * so replaying from the pre-action state is cheaper than trying to persist a live generator
 * (which cannot be serialised).
 */
export const runAction = (
  state: GameState,
  action: GameAction,
  answers: readonly Answer[] = [],
): RunOutcome => {
  const work = cloneState(state);
  const flow = performAction(work, PLAYER, action);
  let next = flow.next();
  let consumed = 0;
  while (!next.done) {
    const request = next.value;
    const answer = answers[consumed];
    if (!answer) return { status: 'awaiting', request };
    consumed += 1;
    next = flow.next(toResponse(request, answer));
  }
  if (consumed < answers.length) {
    throw new Error(`Action raised ${consumed} decisions but ${answers.length} answers were supplied`);
  }
  return { status: 'complete', state: work, turnEnded: next.value === true, result: work.result };
};

const combinations = (pool: number, min: number, max: number): number[][] => {
  const out: number[][] = [];
  const pick: number[] = [];
  const recurse = (start: number) => {
    if (pick.length >= min && pick.length <= max) out.push([...pick]);
    if (pick.length === max) return;
    for (let i = start; i < pool; i += 1) {
      pick.push(i);
      recurse(i + 1);
      pick.pop();
    }
  };
  recurse(0);
  return out;
};

const permutations = (n: number): number[][] => {
  if (n > 5) throw new Error(`Refusing to enumerate ${n}! orderings — puzzle is too sprawling`);
  const out: number[][] = [];
  const recurse = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) {
      out.push(prefix);
      return;
    }
    for (let i = 0; i < rest.length; i += 1) {
      recurse([...prefix, rest[i]!], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  recurse([], Array.from({ length: n }, (_, i) => i));
  return out;
};

/**
 * Every answer a decision request admits. This is what lets the solver branch over the full
 * decision space — the player's own sub-choices maximise, the opponent's minimise, and both
 * enumerate from here. `ChooseTargets` picks are unordered (combinations, ascending); effects
 * that care about sequence ask `ChooseOrder` instead.
 */
export const possibleAnswers = (request: DecisionRequest): Answer[] => {
  switch (request.type) {
    case 'ChooseBlocker':
      return [
        { type: 'ChooseBlocker', index: null },
        ...request.options.map((_, index) => ({ type: 'ChooseBlocker' as const, index })),
      ];
    case 'CounterStep':
      return request.options.map((_, index) => ({ type: 'CounterStep' as const, index }));
    case 'ChooseTargets':
      return combinations(request.options.length, request.min, request.max).map((indices) => ({
        type: 'ChooseTargets' as const,
        indices,
      }));
    case 'ChooseOption':
      return request.options.map((_, index) => ({ type: 'ChooseOption' as const, index }));
    case 'ChooseOrder':
      return permutations(request.options.length).map((order) => ({
        type: 'ChooseOrder' as const,
        order,
      }));
    case 'Mulligan':
    case 'ChooseAction':
      throw new Error(`Unexpected ${request.type} inside a single action`);
  }
};

/** True when the puzzle player has won. */
export const isWin = (result: GameResult | null): boolean =>
  result !== null && result.kind === 'win' && result.winner === PLAYER;
