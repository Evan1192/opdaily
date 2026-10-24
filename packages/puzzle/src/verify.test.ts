import { describe, expect, it } from 'vitest';
import type { PuzzleInput } from './schema.js';
import { verifyPuzzleFile } from './verify.js';

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

describe('verifyPuzzleFile', () => {
  it('passes a unique-line puzzle and emits a solution', () => {
    const { verification, solution } = verifyPuzzleFile({
      ...base,
      id: 'verify-pass',
      title: 'Pass',
      you: { leader: 'ST01-001', don: 1, lifeCards: ['ST01-003'] },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 2,
    });
    expect(verification.ok).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(solution).not.toBeNull();
    expect(solution!.par).toBe(1);
    expect(solution!.optimalLine).toEqual(['declareAttack:ST01-001>ST01-001']);
  });

  it('fails a puzzle with multiple minimal lines and names them', () => {
    const { verification, solution } = verifyPuzzleFile({
      ...base,
      id: 'verify-two-lines',
      title: 'Two lines',
      you: {
        leader: 'ST01-001',
        characters: ['ST01-008', 'ST01-010'],
        lifeCards: ['ST01-003'],
      },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 2,
    });
    expect(verification.ok).toBe(false);
    expect(solution).toBeNull();
    expect(verification.errors.join('\n')).toMatch(/Minimal line is not unique/);
  });

  it('fails an unwinnable puzzle', () => {
    const { verification } = verifyPuzzleFile({
      ...base,
      id: 'verify-unwinnable',
      title: 'Unwinnable',
      you: { leader: 'ST01-001', lifeCards: ['ST01-003'] },
      opponent: { leader: 'ST01-001', lifeCards: ['ST01-002', 'ST01-003', 'ST01-004'] },
      maxActions: 2,
    });
    expect(verification.ok).toBe(false);
    expect(verification.errors.join('\n')).toMatch(/No guaranteed lethal/);
  });

  it('fails when too few sub-optimal wins exist', () => {
    const { verification } = verifyPuzzleFile({
      ...base,
      id: 'verify-no-texture',
      title: 'No texture',
      // maxActions 1: the only win is the single attack, so zero sub-optimal wins exist.
      you: { leader: 'ST01-001', lifeCards: ['ST01-003'] },
      opponent: { leader: 'ST01-001', lifeCards: [] },
      maxActions: 1,
      minSuboptimalWins: 1,
    });
    expect(verification.ok).toBe(false);
    expect(verification.errors.join('\n')).toMatch(/sub-optimal/);
  });

  it('rejects malformed puzzle files at the schema boundary', () => {
    expect(() => verifyPuzzleFile({ id: 'nope' })).toThrow();
  });
});
