import { legalActions } from '@optcg/core';
import type { Puzzle } from './schema.js';
import { parsePuzzle } from './schema.js';
import { PLAYER, buildState } from './runner.js';
import { solvePuzzle, type SolveOptions } from './solve.js';

export interface Verification {
  readonly ok: boolean;
  readonly errors: readonly string[];
  /** Null until the solve step runs (schema/build failures stop earlier). */
  readonly par: number | null;
  readonly optimalLine: readonly string[] | null;
  readonly suboptimalWins: number;
  readonly nodes: number;
}

/**
 * The full shipping gate for one puzzle:
 *  - the scenario builds and the game is not already over,
 *  - the player has real choices on turn one,
 *  - a guaranteed win exists within maxActions,
 *  - the minimal winning line is unique up to canonical equivalence,
 *  - at least `minSuboptimalWins` distinct longer wins exist (the "many worse lines" texture).
 *
 * Unimplemented cards cannot slip through: the engine refuses to resolve unscripted text
 * because `allowUnimplemented` is never set, so a puzzle touching one fails to build or play.
 */
export const verifyPuzzle = (puzzle: Puzzle, options: SolveOptions = {}): Verification => {
  const errors: string[] = [];
  const fail = (par: number | null = null): Verification => ({
    ok: false,
    errors,
    par,
    optimalLine: null,
    suboptimalWins: 0,
    nodes: 0,
  });

  let state;
  try {
    state = buildState(puzzle);
  } catch (error) {
    errors.push(`Scenario failed to build: ${error instanceof Error ? error.message : String(error)}`);
    return fail();
  }
  if (state.result) {
    errors.push('Game is already over in the starting position');
    return fail();
  }
  const opening = legalActions(state, PLAYER);
  if (opening.length < 3) {
    errors.push(`Only ${opening.length} legal opening actions — not a puzzle, a hallway`);
  }
  if (state.activePlayer !== PLAYER) {
    errors.push('Active player is not the puzzle player');
  }

  let solve;
  try {
    solve = solvePuzzle(puzzle, options);
  } catch (error) {
    errors.push(`Solver failed: ${error instanceof Error ? error.message : String(error)}`);
    return fail();
  }

  if (solve.par === null) {
    errors.push(`No guaranteed lethal within ${puzzle.maxActions} actions`);
    return fail();
  }
  if (solve.optimalLines.length === 0) {
    errors.push('Solver found a par but no optimal line — solver bug');
  } else if (solve.optimalLines.length > 1) {
    errors.push(
      `Minimal line is not unique: ${solve.optimalLines.length} distinct ${solve.par}-action wins:\n` +
        solve.optimalLines.map((l) => `  - ${l.join(' | ')}`).join('\n'),
    );
  }
  if (solve.suboptimalWins < puzzle.minSuboptimalWins) {
    errors.push(
      `Only ${solve.suboptimalWins} sub-optimal win(s) found; puzzle requires at least ${puzzle.minSuboptimalWins}`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    par: solve.par,
    optimalLine: solve.optimalLines.length === 1 ? solve.optimalLines[0]! : null,
    suboptimalWins: solve.suboptimalWins,
    nodes: solve.nodes,
  };
};

export interface Solution {
  readonly id: string;
  readonly par: number;
  readonly optimalLine: readonly string[];
  readonly suboptimalWins: number;
}

/** Parse + verify a raw puzzle file, returning the server-side solution artifact. */
export const verifyPuzzleFile = (
  raw: unknown,
  options: SolveOptions = {},
): { puzzle: Puzzle; verification: Verification; solution: Solution | null } => {
  const puzzle = parsePuzzle(raw);
  const verification = verifyPuzzle(puzzle, options);
  const solution =
    verification.ok && verification.par !== null && verification.optimalLine
      ? {
          id: puzzle.id,
          par: verification.par,
          optimalLine: verification.optimalLine,
          suboptimalWins: verification.suboptimalWins,
        }
      : null;
  return { puzzle, verification, solution };
};
