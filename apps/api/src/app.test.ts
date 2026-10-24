import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { MemoryStore } from './store.js';

const deck = {
  name: 'Red Luffy',
  leader: 'ST01-001',
  cards: [
    ['ST01-002', 4],
    ['ST01-003', 4],
    ['ST01-004', 4],
    ['ST01-005', 4],
  ],
};

// Opponent at zero life: leader attack wins in one action. Par 1, one DON spare for
// a sub-optimal two-action line.
const puzzle = {
  id: 'api-test',
  date: '2026-11-01',
  title: 'API test',
  decks: [deck, deck],
  you: { leader: 'ST01-001', don: 1, lifeCards: ['ST01-003'] },
  opponent: { leader: 'ST01-001', lifeCards: [] },
  maxActions: 2,
  difficulty: 'easy',
  teaches: 'Testing.',
};

const PLAYER_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const PLAYER_B = 'bbbbbbbb-1111-2222-3333-444444444444';

const setup = async (nowRef?: { value: number }) => {
  const store = new MemoryStore();
  await store.upsertPuzzle({ id: puzzle.id, date: puzzle.date, par: 1, payload: puzzle });
  const app = await buildApp({ store, now: nowRef ? () => nowRef.value : undefined });
  return { app, store };
};

const startSession = async (app: FastifyInstance, playerId = PLAYER_A): Promise<string> => {
  const res = await app.inject({
    method: 'POST',
    url: '/session',
    payload: { puzzleId: puzzle.id, playerId },
  });
  expect(res.statusCode).toBe(200);
  return res.json().sessionId as string;
};

describe('api', () => {
  it('serves today puzzle without the solution', async () => {
    const now = { value: Date.parse('2026-11-02T12:00:00Z') };
    const { app } = await setup(now);
    const res = await app.inject({ method: 'GET', url: '/puzzle/today' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('api-test');
    expect(body.par).toBe(1);
    expect(JSON.stringify(body)).not.toContain('declareAttack');
  });

  it('plays a winning line and scores it server-side', async () => {
    const now = { value: Date.parse('2026-11-02T12:00:00Z') };
    const { app, store } = await setup(now);
    const sessionId = await startSession(app);

    const state = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const actions = state.json().actions as { key: string }[];
    const attack = actions.find((a) => a.key.startsWith('declareAttack:'));
    expect(attack).toBeDefined();

    now.value += 30_000;
    const res = await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack!.key },
    });
    const body = res.json();
    expect(body.won).toBe(true);
    expect(body.solved).toBe(true);
    expect(body.actionsSpent).toBe(1);
    expect(body.teaches).toBe('Testing.');

    const board = await store.leaderboard(puzzle.id, 10);
    expect(board).toHaveLength(1);
    expect(board[0]!.actionCount).toBe(1);
    expect(board[0]!.elapsedMs).toBe(30_000);
  });

  it('rejects forged action keys', async () => {
    const { app, store } = await setup();
    const sessionId = await startSession(app);
    const res = await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: 'declareAttack:c99>c0' },
    });
    expect(res.statusCode).toBe(422);
    expect(await store.leaderboard(puzzle.id, 10)).toHaveLength(0);
  });

  it('gives each player one attempt per puzzle', async () => {
    const { app } = await setup();
    const first = await startSession(app);
    // Same player again: resumes the same session rather than minting a fresh attempt.
    const again = await app.inject({
      method: 'POST',
      url: '/session',
      payload: { puzzleId: puzzle.id, playerId: PLAYER_A },
    });
    expect(again.json().sessionId).toBe(first);
    // Different player: new session.
    const other = await startSession(app, PLAYER_B);
    expect(other).not.toBe(first);
  });

  it('refuses further input after a solve', async () => {
    const { app } = await setup();
    const sessionId = await startSession(app);
    const state = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const attack = (state.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('declareAttack:'),
    )!;
    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack.key },
    });
    const after = await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack.key },
    });
    expect(after.statusCode).toBe(409);
    const reset = await app.inject({ method: 'POST', url: `/session/${sessionId}/reset` });
    expect(reset.statusCode).toBe(409);
  });

  it('undo removes the action from the count but not the clock', async () => {
    const now = { value: Date.parse('2026-11-02T12:00:00Z') };
    const { app, store } = await setup(now);
    const sessionId = await startSession(app);
    const state = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const don = (state.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('attachDon:'),
    )!;

    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: don.key },
    });
    now.value += 60_000;
    const undone = await app.inject({ method: 'POST', url: `/session/${sessionId}/undo` });
    expect(undone.json().actionsSpent).toBe(0);

    const fresh = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const attack = (fresh.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('declareAttack:'),
    )!;
    now.value += 10_000;
    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack.key },
    });
    const board = await store.leaderboard(puzzle.id, 10);
    expect(board[0]!.actionCount).toBe(1);
    // Clock ran from session start — the undone exploration still cost time.
    expect(board[0]!.elapsedMs).toBe(70_000);
  });

  it('reset restarts the clock and is counted', async () => {
    const now = { value: Date.parse('2026-11-02T12:00:00Z') };
    const { app, store } = await setup(now);
    const sessionId = await startSession(app);
    const state = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const don = (state.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('attachDon:'),
    )!;
    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: don.key },
    });
    now.value += 120_000;
    const reset = await app.inject({ method: 'POST', url: `/session/${sessionId}/reset` });
    expect(reset.json().actionsSpent).toBe(0);

    const fresh = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const attack = (fresh.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('declareAttack:'),
    )!;
    now.value += 5_000;
    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack.key },
    });
    const board = await store.leaderboard(puzzle.id, 10);
    // Clock measures from the reset, not the original start.
    expect(board[0]!.elapsedMs).toBe(5_000);
    const session = await store.findSession(puzzle.id, PLAYER_A);
    expect(session!.resets).toBe(1);
  });

  it('failing the puzzle by ending the turn is reported', async () => {
    const { app } = await setup();
    const sessionId = await startSession(app);
    const res = await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: 'endTurn' },
    });
    const body = res.json();
    expect(body.won).toBe(false);
    expect(body.failed).toBe(true);
    expect(body.actions).toHaveLength(0);
  });

  it('names the player on the leaderboard', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: '/player/name',
      payload: { playerId: PLAYER_A, name: 'Zoro' },
    });
    const sessionId = await startSession(app);
    const state = await app.inject({ method: 'GET', url: `/session/${sessionId}/state` });
    const attack = (state.json().actions as { key: string }[]).find((a) =>
      a.key.startsWith('declareAttack:'),
    )!;
    await app.inject({
      method: 'POST',
      url: `/session/${sessionId}/action`,
      payload: { key: attack.key },
    });
    const board = await app.inject({ method: 'GET', url: `/leaderboard/${puzzle.id}` });
    const entries = board.json().entries as { name: string; actions: number; rank: number }[];
    expect(entries).toEqual([{ rank: 1, name: 'Zoro', actions: 1, elapsedMs: expect.any(Number) }]);
  });
});
