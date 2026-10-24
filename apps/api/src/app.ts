import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { parsePuzzle, type Puzzle } from '@opdaily/puzzle';
import { IllegalActionError, PuzzleGame, emptyJournal, type Journal } from './game.js';
import type { SessionRow, Store } from './store.js';

const playerIdSchema = z.string().regex(/^[a-f0-9-]{10,64}$/i);
const nameSchema = z.string().trim().min(1).max(24);

export interface AppOptions {
  readonly store: Store;
  readonly corsOrigin?: string;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

/** Games are stateless engine replays, but construction builds a scenario — cache per puzzle. */
const games = new Map<string, PuzzleGame>();
const gameFor = (puzzle: Puzzle): PuzzleGame => {
  let game = games.get(puzzle.id);
  if (!game) {
    game = new PuzzleGame(puzzle);
    games.set(puzzle.id, game);
  }
  return game;
};

const journalActions = (journal: Journal): number => journal.entries.length;

export const buildApp = async (options: AppOptions): Promise<FastifyInstance> => {
  const { store } = options;
  const now = options.now ?? Date.now;
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: options.corsOrigin ?? true });

  app.get('/health', async () => ({ ok: true }));

  // Today's puzzle, redacted: the client gets the board spec and par, never the solution.
  app.get('/puzzle/today', async (_req, reply) => {
    const date = new Date(now()).toISOString().slice(0, 10);
    const row = await store.puzzleForDate(date);
    if (!row) return reply.code(404).send({ error: 'No puzzle available' });
    const puzzle = parsePuzzle(row.payload);
    return {
      id: puzzle.id,
      date: puzzle.date,
      title: puzzle.title,
      flavor: puzzle.flavor ?? null,
      difficulty: puzzle.difficulty,
      maxActions: puzzle.maxActions,
      par: row.par,
    };
  });

  // Start (or resume) the player's single attempt at a puzzle.
  app.post('/session', async (req, reply) => {
    const body = z.object({ puzzleId: z.string(), playerId: playerIdSchema }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Bad request' });
    const row = await store.getPuzzle(body.data.puzzleId);
    if (!row) return reply.code(404).send({ error: 'Unknown puzzle' });

    const existing = await store.findSession(row.id, body.data.playerId);
    if (existing) return sessionReply(existing, row.par);

    const session: SessionRow = {
      id: randomUUID(),
      puzzleId: row.id,
      playerId: body.data.playerId,
      startedAt: now(),
      finishedAt: null,
      journal: emptyJournal,
      actionsSpent: 0,
      resets: 0,
      solved: false,
    };
    try {
      await store.createSession(session);
    } catch {
      const raced = await store.findSession(row.id, body.data.playerId);
      if (raced) return sessionReply(raced, row.par);
      throw new Error('Session creation failed');
    }
    return sessionReply(session, row.par);
  });

  const sessionReply = (session: SessionRow, par: number) => ({
    sessionId: session.id,
    puzzleId: session.puzzleId,
    par,
    solved: session.solved,
    actionsSpent: session.actionsSpent,
    finished: session.finishedAt !== null,
  });

  const loadSession = async (id: string) => {
    const session = await store.getSession(id);
    if (!session) return null;
    const row = await store.getPuzzle(session.puzzleId);
    if (!row) return null;
    return { session, row, puzzle: parsePuzzle(row.payload) };
  };

  const stateReply = (game: PuzzleGame, session: SessionRow, par: number) => {
    const position = game.replay(session.journal);
    const snapshot = game.snapshot(position);
    return {
      view: snapshot.view,
      actions: snapshot.actions,
      pending: snapshot.pending
        ? {
            type: snapshot.pending.request.type,
            prompt: 'prompt' in snapshot.pending.request ? snapshot.pending.request.prompt : null,
            request: snapshot.pending.request,
            optionCount: snapshot.pending.options.length,
            options: snapshot.pending.options,
          }
        : null,
      actionsSpent: journalActions(session.journal),
      maxActions: game.puzzle.maxActions,
      par,
      won: position.won,
      failed: position.failed,
      solved: session.solved,
      teaches: position.won ? game.puzzle.teaches : null,
    };
  };

  app.get('/session/:id/state', async (req, reply) => {
    const { id } = req.params as { id: string };
    const loaded = await loadSession(id);
    if (!loaded) return reply.code(404).send({ error: 'Unknown session' });
    return stateReply(gameFor(loaded.puzzle), loaded.session, loaded.row.par);
  });

  // Apply a move: a fresh action key, or an answer index for the pending decision.
  app.post('/session/:id/action', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .union([z.object({ key: z.string() }), z.object({ choice: z.number().int().min(0) })])
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Bad request' });
    const loaded = await loadSession(id);
    if (!loaded) return reply.code(404).send({ error: 'Unknown session' });
    if (loaded.session.solved || loaded.session.finishedAt !== null) {
      return reply.code(409).send({ error: 'Attempt already finished' });
    }

    const game = gameFor(loaded.puzzle);
    let journal: Journal;
    try {
      journal = game.advance(loaded.session.journal, body.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Illegal move';
      return reply.code(error instanceof IllegalActionError ? 422 : 409).send({ error: message });
    }

    const position = game.replay(journal);
    let session: SessionRow = {
      ...loaded.session,
      journal,
      actionsSpent: journalActions(journal),
    };
    if (position.won) {
      // Server-authoritative scoring: the score is written here, from the server's own replay —
      // client-reported counts and timings are never trusted.
      const elapsed = Math.max(0, now() - session.startedAt);
      session = { ...session, solved: true, finishedAt: now() };
      await store.updateSession(session);
      await store.insertScore(session.puzzleId, session.playerId, session.actionsSpent, elapsed);
    } else {
      await store.updateSession(session);
    }
    return stateReply(game, session, loaded.row.par);
  });

  app.post('/session/:id/undo', async (req, reply) => {
    const { id } = req.params as { id: string };
    const loaded = await loadSession(id);
    if (!loaded) return reply.code(404).send({ error: 'Unknown session' });
    if (loaded.session.solved) return reply.code(409).send({ error: 'Attempt already finished' });
    const game = gameFor(loaded.puzzle);
    let journal: Journal;
    try {
      journal = game.undo(loaded.session.journal);
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : 'Cannot undo' });
    }
    // Undo never reduces the clock and the action count is always the journal length — an undone
    // action no longer counts, but the time spent exploring it does.
    const session: SessionRow = { ...loaded.session, journal, actionsSpent: journalActions(journal) };
    await store.updateSession(session);
    return stateReply(game, session, loaded.row.par);
  });

  app.post('/session/:id/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    const loaded = await loadSession(id);
    if (!loaded) return reply.code(404).send({ error: 'Unknown session' });
    if (loaded.session.solved) return reply.code(409).send({ error: 'Attempt already finished' });
    // Reset restarts the clock: the tiebreak measures the clean solving run, but resets are
    // recorded so repeated retries are visible in the data.
    const session: SessionRow = {
      ...loaded.session,
      journal: emptyJournal,
      actionsSpent: 0,
      resets: loaded.session.resets + 1,
      startedAt: now(),
    };
    await store.updateSession(session);
    return stateReply(gameFor(loaded.puzzle), session, loaded.row.par);
  });

  app.post('/player/name', async (req, reply) => {
    const body = z.object({ playerId: playerIdSchema, name: nameSchema }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Bad request' });
    await store.setPlayerName(body.data.playerId, body.data.name);
    return { ok: true };
  });

  app.get('/leaderboard/:puzzleId', async (req, reply) => {
    const { puzzleId } = req.params as { puzzleId: string };
    const row = await store.getPuzzle(puzzleId);
    if (!row) return reply.code(404).send({ error: 'Unknown puzzle' });
    const rows = await store.leaderboard(puzzleId, 50);
    return {
      puzzleId,
      par: row.par,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        name: r.displayName,
        actions: r.actionCount,
        elapsedMs: r.elapsedMs,
      })),
    };
  });

  return app;
};
