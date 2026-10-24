import { describe, expect, it } from 'vitest';
import { parsePuzzle, type PuzzleInput } from './schema.js';
import {
  actionKey,
  buildState,
  canonicalActionKey,
  cloneState,
  isWin,
  optionsFor,
  runAction,
  stateHash,
} from './runner.js';

const deck = {
  name: 'Red Luffy',
  leader: 'ST01-001',
  cards: [
    ['ST01-002', 4],
    ['ST01-003', 4],
    ['ST01-004', 4],
    ['ST01-005', 4],
  ],
} satisfies PuzzleInput['decks'][number];

/**
 * One-attack lethal: our leader swings into theirs; opponent has one life card, no board,
 * no hand — the first hit clears life, the second (or a direct hit at 0) wins. With exactly
 * zero lifeCards the very first leader attack is lethal.
 */
const puzzle = parsePuzzle({
  id: 'runner-test',
  date: '2026-11-01',
  title: 'Runner test',
  decks: [deck, deck],
  you: {
    leader: 'ST01-001',
    characters: ['ST01-004', 'ST01-005'],
    don: 3,
    lifeCards: ['ST01-003'],
  },
  opponent: {
    leader: 'ST01-001',
    lifeCards: [],
  },
  maxActions: 3,
  difficulty: 'easy',
  teaches: 'Testing.',
} satisfies PuzzleInput);

describe('runner', () => {
  it('builds a deterministic state: same puzzle, same hash', () => {
    expect(stateHash(buildState(puzzle))).toBe(stateHash(buildState(puzzle)));
  });

  it('clones without mutating or reshuffling', () => {
    const state = buildState(puzzle);
    const before = stateHash(state);
    const clone = cloneState(state);
    expect(stateHash(clone)).toBe(before);
    // mutate the clone; original untouched
    const attack = optionsFor(clone).find((a) => a.kind === 'declareAttack');
    expect(attack).toBeDefined();
    runAction(clone, attack!);
    expect(stateHash(state)).toBe(before);
  });

  it('runAction never mutates its input state', () => {
    const state = buildState(puzzle);
    const before = stateHash(state);
    const attack = optionsFor(state).find((a) => a.kind === 'declareAttack')!;
    const outcome = runAction(state, attack);
    expect(outcome.status).toBe('complete');
    expect(stateHash(state)).toBe(before);
  });

  it('a leader attack at zero life wins the game', () => {
    const state = buildState(puzzle);
    // The only legal attack target with an empty opponent board is their leader.
    const attacks = optionsFor(state).filter((a) => a.kind === 'declareAttack');
    expect(attacks.length).toBeGreaterThan(0);
    const outcome = runAction(state, attacks[0]!);
    if (outcome.status !== 'complete') throw new Error('expected completion');
    expect(isWin(outcome.result)).toBe(true);
  });

  it('endTurn reports turnEnded', () => {
    const state = buildState(puzzle);
    const end = optionsFor(state).find((a) => a.kind === 'endTurn')!;
    const outcome = runAction(state, end);
    if (outcome.status !== 'complete') throw new Error('expected completion');
    expect(outcome.turnEnded).toBe(true);
    expect(outcome.result).toBeNull();
  });

  it('actionKey is stable across identical rebuilds', () => {
    const a = optionsFor(buildState(puzzle)).map(actionKey);
    const b = optionsFor(buildState(puzzle)).map(actionKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // keys are unique within one option list
  });

  it('canonicalActionKey collapses duplicate copies, attachDon targets by definition', () => {
    const state = buildState(puzzle);
    const dons = optionsFor(state).filter((a) => a.kind === 'attachDon');
    // leader + 2 characters = 3 attach targets
    expect(dons).toHaveLength(3);
    const canon = dons.map((a) => canonicalActionKey(state, a));
    expect(canon).toContain('attachDon:ST01-001');
    expect(canon).toContain('attachDon:ST01-004');
  });

  it('transpositions hash equal: attack after don-attach to uninvolved character', () => {
    const state = buildState(puzzle);
    // order A: attach don to character ST01-004 — hash x
    const don = optionsFor(state).find(
      (a) => a.kind === 'attachDon' && canonicalActionKey(state, a) === 'attachDon:ST01-004',
    )!;
    const afterA = runAction(state, don);
    const afterB = runAction(state, don);
    if (afterA.status !== 'complete' || afterB.status !== 'complete') throw new Error('expected completion');
    expect(stateHash(afterA.state)).toBe(stateHash(afterB.state));
  });
});
