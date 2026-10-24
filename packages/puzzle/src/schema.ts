import { z } from 'zod';
import type { ScenarioSpec, SideSpec } from '@optcg/core/testing';
import type { DeckList } from '@optcg/core';

/**
 * A puzzle file, as committed under puzzles/.
 *
 * The invariants here exist so that "lethal" is well-defined: a line only
 * counts if it wins against *every* legal defence, and that is only checkable
 * when nothing about the position is hidden or sampled.
 *
 * - The opponent's hand is empty unless `knownHand` is given, in which case
 *   the UI shows it face-up. Counters can never appear from hidden cards.
 * - The opponent's life cards are explicit (top first), so which `[Trigger]`
 *   flips on each hit is determinate and the solver can explore it.
 * - `deckTop` may pin draws/reveals where a card effect looks at the deck.
 *   Anything unpinned is still deterministic — the whole game runs off the
 *   puzzle seed — but a pinned card is an *authored* choice, not an artifact
 *   of the seed.
 */

const cardIdString = z.string().regex(/^(?:OP|EB|ST|PRB|P)[A-Z0-9]*-\d{3}(?:_p\d+)?$/, 'not a card id');

const characterSpecSchema = z.union([
  cardIdString,
  z.object({
    id: cardIdString,
    rested: z.boolean().optional(),
    /** DON!! attached, each +1000 power. */
    don: z.number().int().min(0).max(10).optional(),
    /** Summoning-sick. */
    playedThisTurn: z.boolean().optional(),
  }),
]);

const deckListSchema = z.object({
  name: z.string().min(1),
  leader: cardIdString,
  /** `[cardId, count]` pairs. Deck-size validation is skipped for puzzles. */
  cards: z.array(z.tuple([cardIdString, z.number().int().min(1).max(4)])).min(1),
});

const sideBase = {
  leader: cardIdString,
  characters: z.array(characterSpecSchema).max(5).optional(),
  stage: cardIdString.optional(),
  /** Active, unattached DON!! in the cost area. */
  don: z.number().int().min(0).max(10).optional(),
  /** Rested, unattached DON!! in the cost area. */
  restedDon: z.number().int().min(0).max(10).optional(),
  /** Exact life cards, top first. */
  lifeCards: z.array(cardIdString).max(6),
  /** Exact cards on top of the deck, first drawn first. */
  deckTop: z.array(cardIdString).optional(),
  trash: z.array(cardIdString).optional(),
};

const youSideSchema = z.object({
  ...sideBase,
  hand: z.array(cardIdString).optional(),
});

const opponentSideSchema = z.object({
  ...sideBase,
  /**
   * Cards in the opponent's hand, shown face-up in the UI. Omit for the
   * default empty hand. Never hidden: a puzzle whose answer depends on a
   * guess about unseen counters is not a puzzle.
   */
  knownHand: z.array(cardIdString).optional(),
});

export const puzzleSchema = z.object({
  /** Slug, doubles as the filename stem. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** UTC publication date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  flavor: z.string().optional(),
  /** Real deck lists; needed so the unseen parts of each deck are real cards. */
  decks: z.tuple([deckListSchema, deckListSchema]),
  you: youSideSchema,
  opponent: opponentSideSchema,
  turn: z.number().int().min(2).max(30).default(5),
  seed: z.string().default(''),
  /** Solver depth cap; a line longer than this does not count as a solution. */
  maxActions: z.number().int().min(1).max(8),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  /** Shown after the solve: what the puzzle wanted you to notice. */
  teaches: z.string().min(1),
  /** Verification floor for distinct sub-optimal wins (puzzle "texture"). */
  minSuboptimalWins: z.number().int().min(0).default(1),
});

export type Puzzle = z.infer<typeof puzzleSchema>;
export type PuzzleInput = z.input<typeof puzzleSchema>;

export const parsePuzzle = (raw: unknown): Puzzle => puzzleSchema.parse(raw);

/**
 * Compile a puzzle to the engine's scenario spec, minus definitions/scripts —
 * the runner owns those, since they come from the vendored snapshot and card
 * registry rather than from the puzzle file.
 */
export type PuzzleScenario = Omit<ScenarioSpec, 'definitions' | 'scripts'>;

export const toScenario = (puzzle: Puzzle): PuzzleScenario => {
  const side = (spec: Puzzle['you'] | Puzzle['opponent'], hand: readonly string[]): SideSpec => ({
    leader: spec.leader,
    hand,
    ...(spec.characters ? { characters: spec.characters } : {}),
    ...(spec.stage ? { stage: spec.stage } : {}),
    ...(spec.don !== undefined ? { don: spec.don } : {}),
    ...(spec.restedDon !== undefined ? { restedDon: spec.restedDon } : {}),
    lifeCards: spec.lifeCards,
    ...(spec.deckTop ? { deckTop: spec.deckTop } : {}),
    ...(spec.trash ? { trash: spec.trash } : {}),
  });

  const decks: readonly [DeckList, DeckList] = [
    { name: puzzle.decks[0].name, leader: puzzle.decks[0].leader, cards: puzzle.decks[0].cards },
    { name: puzzle.decks[1].name, leader: puzzle.decks[1].leader, cards: puzzle.decks[1].cards },
  ];

  return {
    decks,
    activePlayer: 0,
    turn: puzzle.turn,
    you: side(puzzle.you, puzzle.you.hand ?? []),
    opponent: side(puzzle.opponent, puzzle.opponent.knownHand ?? []),
    seed: puzzle.seed === '' ? `opdaily:${puzzle.id}` : puzzle.seed,
  };
};
