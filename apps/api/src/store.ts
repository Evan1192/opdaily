import pg from 'pg';
import type { Journal } from './game.js';

export interface PuzzleRow {
  readonly id: string;
  readonly date: string;
  readonly par: number;
  readonly payload: unknown;
}

export interface SessionRow {
  readonly id: string;
  readonly puzzleId: string;
  readonly playerId: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly journal: Journal;
  readonly actionsSpent: number;
  readonly resets: number;
  readonly solved: boolean;
}

export interface ScoreRow {
  readonly playerId: string;
  readonly displayName: string;
  readonly actionCount: number;
  readonly elapsedMs: number;
}

export interface Store {
  upsertPuzzle(row: PuzzleRow): Promise<void>;
  /** Today's puzzle: exact date match, else the most recent puzzle dated on or before it. */
  puzzleForDate(date: string): Promise<PuzzleRow | null>;
  getPuzzle(id: string): Promise<PuzzleRow | null>;
  setPlayerName(playerId: string, name: string): Promise<void>;
  createSession(row: SessionRow): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  findSession(puzzleId: string, playerId: string): Promise<SessionRow | null>;
  updateSession(row: SessionRow): Promise<void>;
  insertScore(puzzleId: string, playerId: string, actionCount: number, elapsedMs: number): Promise<void>;
  leaderboard(puzzleId: string, limit: number): Promise<ScoreRow[]>;
}

export class MemoryStore implements Store {
  private readonly puzzles = new Map<string, PuzzleRow>();
  private readonly players = new Map<string, string>();
  private readonly sessions = new Map<string, SessionRow>();
  private readonly scores = new Map<string, { playerId: string; actionCount: number; elapsedMs: number }[]>();

  async upsertPuzzle(row: PuzzleRow): Promise<void> {
    this.puzzles.set(row.id, row);
  }
  async puzzleForDate(date: string): Promise<PuzzleRow | null> {
    const eligible = [...this.puzzles.values()].filter((p) => p.date <= date);
    eligible.sort((a, b) => (a.date < b.date ? 1 : -1));
    return eligible[0] ?? null;
  }
  async getPuzzle(id: string): Promise<PuzzleRow | null> {
    return this.puzzles.get(id) ?? null;
  }
  async setPlayerName(playerId: string, name: string): Promise<void> {
    this.players.set(playerId, name);
  }
  async createSession(row: SessionRow): Promise<void> {
    if ([...this.sessions.values()].some((s) => s.puzzleId === row.puzzleId && s.playerId === row.playerId)) {
      throw new Error('duplicate session');
    }
    this.sessions.set(row.id, row);
  }
  async getSession(id: string): Promise<SessionRow | null> {
    return this.sessions.get(id) ?? null;
  }
  async findSession(puzzleId: string, playerId: string): Promise<SessionRow | null> {
    return (
      [...this.sessions.values()].find((s) => s.puzzleId === puzzleId && s.playerId === playerId) ?? null
    );
  }
  async updateSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.id, row);
  }
  async insertScore(puzzleId: string, playerId: string, actionCount: number, elapsedMs: number): Promise<void> {
    const rows = this.scores.get(puzzleId) ?? [];
    if (rows.some((r) => r.playerId === playerId)) return;
    rows.push({ playerId, actionCount, elapsedMs });
    this.scores.set(puzzleId, rows);
  }
  async leaderboard(puzzleId: string, limit: number): Promise<ScoreRow[]> {
    const rows = this.scores.get(puzzleId) ?? [];
    return [...rows]
      .sort((a, b) => a.actionCount - b.actionCount || a.elapsedMs - b.elapsedMs)
      .slice(0, limit)
      .map((r) => ({ ...r, displayName: this.players.get(r.playerId) ?? 'Anonymous' }));
  }
}

const toSession = (r: Record<string, unknown>): SessionRow => ({
  id: r['id'] as string,
  puzzleId: r['puzzle_id'] as string,
  playerId: r['player_id'] as string,
  startedAt: new Date(r['started_at'] as string).getTime(),
  finishedAt: r['finished_at'] ? new Date(r['finished_at'] as string).getTime() : null,
  journal: r['journal'] as Journal,
  actionsSpent: r['actions_spent'] as number,
  resets: r['resets'] as number,
  solved: r['solved'] as boolean,
});

export class PgStore implements Store {
  constructor(private readonly pool: pg.Pool) {}

  async upsertPuzzle(row: PuzzleRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO puzzles (id, date, par, payload) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET date = $2, par = $3, payload = $4`,
      [row.id, row.date, row.par, JSON.stringify(row.payload)],
    );
  }
  async puzzleForDate(date: string): Promise<PuzzleRow | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM puzzles WHERE date <= $1 ORDER BY date DESC LIMIT 1',
      [date],
    );
    return rows[0] ?? null;
  }
  async getPuzzle(id: string): Promise<PuzzleRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM puzzles WHERE id = $1', [id]);
    return rows[0] ?? null;
  }
  async setPlayerName(playerId: string, name: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO players (id, display_name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = $2`,
      [playerId, name],
    );
  }
  async createSession(row: SessionRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (id, puzzle_id, player_id, started_at, journal)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5)`,
      [row.id, row.puzzleId, row.playerId, row.startedAt, JSON.stringify(row.journal)],
    );
  }
  async getSession(id: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }
  async findSession(puzzleId: string, playerId: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM sessions WHERE puzzle_id = $1 AND player_id = $2',
      [puzzleId, playerId],
    );
    return rows[0] ? toSession(rows[0]) : null;
  }
  async updateSession(row: SessionRow): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET journal = $2, actions_spent = $3, resets = $4, solved = $5,
         started_at = to_timestamp($6 / 1000.0),
         finished_at = CASE WHEN $7::bigint IS NULL THEN NULL ELSE to_timestamp($7 / 1000.0) END
       WHERE id = $1`,
      [row.id, JSON.stringify(row.journal), row.actionsSpent, row.resets, row.solved, row.startedAt, row.finishedAt],
    );
  }
  async insertScore(puzzleId: string, playerId: string, actionCount: number, elapsedMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO scores (puzzle_id, player_id, action_count, elapsed_ms)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [puzzleId, playerId, actionCount, elapsedMs],
    );
  }
  async leaderboard(puzzleId: string, limit: number): Promise<ScoreRow[]> {
    const { rows } = await this.pool.query(
      `SELECT s.player_id, s.action_count, s.elapsed_ms, COALESCE(p.display_name, 'Anonymous') AS display_name
       FROM scores s LEFT JOIN players p ON p.id = s.player_id
       WHERE s.puzzle_id = $1
       ORDER BY s.action_count ASC, s.elapsed_ms ASC
       LIMIT $2`,
      [puzzleId, limit],
    );
    return rows.map((r: Record<string, unknown>) => ({
      playerId: r['player_id'] as string,
      displayName: r['display_name'] as string,
      actionCount: r['action_count'] as number,
      elapsedMs: Number(r['elapsed_ms']),
    }));
  }
}
