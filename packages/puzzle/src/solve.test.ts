import { describe, expect, it } from 'vitest';
import { parsePuzzle, type PuzzleInput } from './schema.js';
import { canonicalLine, solvePuzzle } from './solve.js';

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

const base = {
  date: '2026-11-01',
  decks: [deck, deck] as PuzzleInput['decks'],
  difficulty: 'easy' as const,
  teaches: 'Testing.',
};

describe('canonicalLine', () => {
  it('sorts consecutive attachDon runs but preserves everything else', () => {
    const a = canonicalLine(['attachDon:X', 'attachDon:A', 'declareAttack:L>L', 'attachDon:B']);
    const b = canonicalLine(['attachDon:A', 'attachDon:X', 'declareAttack:L>L', 'attachDon:B']);
    expect(a).toBe(b);
    const c = canonicalLine(['attachDon:B', 'declareAttack:L>L', 'attachDon:A', 'attachDon:X']);
    expect(c).not.toBe(a);
  });
});

describe('solvePuzzle', () => {
  it('proves a unique 1-action lethal and counts sub-optimal wins', () => {
    const puzzle = parsePuzzle({
      ...base,
      id: 'solve-unique',
      title: 'Unique lethal',
      you: { leader: 'ST01-001', don: 1, lifeCards: ['ST01-003'] },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 2,
    });
    const result = solvePuzzle(puzzle);
    expect(result.par).toBe(1);
    expect(result.optimalLines).toHaveLength(1);
    expect(result.optimalLines[0]).toEqual(['declareAttack:ST01-001>ST01-001']);
    // attach DON!! first, then attack = at least one distinct 2-action win
    expect(result.suboptimalWins).toBeGreaterThanOrEqual(1);
  });

  it('rejects a two-solution puzzle: two different attackers both lethal in one action', () => {
    const puzzle = parsePuzzle({
      ...base,
      id: 'solve-two-solutions',
      title: 'Two solutions',
      you: {
        leader: 'ST01-001',
        characters: ['ST01-008', 'ST01-010'],
        lifeCards: ['ST01-003'],
      },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 2,
    });
    const result = solvePuzzle(puzzle);
    expect(result.par).toBe(1);
    expect(result.optimalLines.length).toBeGreaterThanOrEqual(3); // leader, Robin, Franky
  });

  it('collapses identical copies: two copies of the same attacker are one line', () => {
    const puzzle = parsePuzzle({
      ...base,
      id: 'solve-identical-copies',
      title: 'Identical copies',
      you: {
        leader: 'ST01-001',
        characters: ['ST01-008', 'ST01-008'],
        lifeCards: ['ST01-003'],
      },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 1,
    });
    const result = solvePuzzle(puzzle);
    expect(result.par).toBe(1);
    // Robin A attacking and Robin B attacking are the same canonical line; the leader attack
    // is the only other optimal line.
    const lines = result.optimalLines.map((l) => l.join(' | '));
    expect(lines).toContain('declareAttack:ST01-008>ST01-001');
    expect(result.optimalLines).toHaveLength(2);
  });

  it('minimax: a Blocker the opponent controls raises par from 1 to 2', () => {
    const puzzle = parsePuzzle({
      ...base,
      id: 'solve-blocker',
      title: 'Blocker math',
      you: {
        leader: 'ST01-001',
        characters: ['ST01-010'],
        lifeCards: ['ST01-003'],
      },
      opponent: {
        leader: 'ST01-001',
        characters: ['ST01-006'], // Chopper, [Blocker]
        lifeCards: [],
      },
      maxActions: 3,
    });
    const result = solvePuzzle(puzzle);
    // One attack alone never guarantees lethal — the Blocker eats it. Two attacks do:
    // the first forces the block (or wins outright), the second lands.
    expect(result.par).toBe(2);
  });

  it('returns null par when no guaranteed lethal exists', () => {
    const puzzle = parsePuzzle({
      ...base,
      id: 'solve-unwinnable',
      title: 'Unwinnable',
      you: { leader: 'ST01-001', lifeCards: ['ST01-003'] },
      opponent: {
        leader: 'ST01-001',
        lifeCards: ['ST01-002', 'ST01-003', 'ST01-004'],
      },
      maxActions: 2,
    });
    const result = solvePuzzle(puzzle);
    expect(result.par).toBeNull();
    expect(result.optimalLines).toHaveLength(0);
  });
});
