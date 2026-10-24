import { describe, expect, it } from 'vitest';
import { scenario } from '@optcg/core/testing';
import { legalActions } from '@optcg/core';
import { parsePuzzle, toScenario, type PuzzleInput } from './schema.js';
import { loadVendoredDefinitions, loadScripts } from './engine-data.js';

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

const base: PuzzleInput = {
  id: 'test-puzzle',
  date: '2026-11-01',
  title: 'Test',
  decks: [deck, deck],
  you: {
    leader: 'ST01-001',
    characters: [{ id: 'ST01-004', don: 1 }, 'ST01-005'],
    hand: ['ST01-002'],
    don: 4,
    lifeCards: ['ST01-003'],
  },
  opponent: {
    leader: 'ST01-001',
    characters: ['ST01-003'],
    lifeCards: ['ST01-002'],
  },
  maxActions: 4,
  difficulty: 'easy',
  teaches: 'Testing.',
};

describe('puzzleSchema', () => {
  it('parses a valid puzzle and applies defaults', () => {
    const puzzle = parsePuzzle(base);
    expect(puzzle.turn).toBe(5);
    expect(puzzle.minSuboptimalWins).toBe(1);
    expect(puzzle.seed).toBe('');
  });

  it('rejects malformed card ids', () => {
    expect(() => parsePuzzle({ ...base, you: { ...base.you, leader: 'not-a-card' } })).toThrow();
  });

  it('rejects an opponent hand under any other key', () => {
    const smuggled = { ...base, opponent: { ...base.opponent, hand: ['ST01-002'] } };
    expect(() => parsePuzzle(smuggled)).not.toThrow(); // unknown keys are stripped...
    const compiled = toScenario(parsePuzzle(smuggled));
    expect(compiled.opponent?.hand).toEqual([]); // ...and never reach the board
  });

  it('compiles to a scenario the engine accepts, with deterministic seed', () => {
    const puzzle = parsePuzzle(base);
    const spec = toScenario(puzzle);
    expect(spec.seed).toBe('opdaily:test-puzzle');
    expect(spec.activePlayer).toBe(0);

    const definitions = loadVendoredDefinitions();
    const s = scenario({ ...spec, definitions, scripts: loadScripts() });
    expect(s.you.characters).toHaveLength(2);
    expect(s.you.life).toHaveLength(1);
    expect(s.opponent.hand).toHaveLength(0);
    const actions = legalActions(s.state, 0);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some((a) => a.kind === 'endTurn')).toBe(true);
  });

  it('shows a knownHand face-up on the opponent side', () => {
    const puzzle = parsePuzzle({
      ...base,
      opponent: { ...base.opponent, knownHand: ['ST01-002', 'ST01-003'] },
    });
    const spec = toScenario(puzzle);
    expect(spec.opponent?.hand).toEqual(['ST01-002', 'ST01-003']);
  });
});
