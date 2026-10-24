import type { LeaderboardEntry, PuzzleInfo, SessionState } from './types';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  return body as T;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const fetchToday = (): Promise<PuzzleInfo> => request('/puzzle/today');

export const startSession = (
  puzzleId: string,
  playerId: string,
): Promise<{ sessionId: string; par: number; solved: boolean }> =>
  request('/session', { method: 'POST', body: JSON.stringify({ puzzleId, playerId }) });

export const fetchState = (sessionId: string): Promise<SessionState> =>
  request(`/session/${sessionId}/state`);

export const sendAction = (sessionId: string, move: { key: string } | { choice: number }): Promise<SessionState> =>
  request(`/session/${sessionId}/action`, { method: 'POST', body: JSON.stringify(move) });

export const sendUndo = (sessionId: string): Promise<SessionState> =>
  request(`/session/${sessionId}/undo`, { method: 'POST' });

export const sendReset = (sessionId: string): Promise<SessionState> =>
  request(`/session/${sessionId}/reset`, { method: 'POST' });

export const setName = (playerId: string, name: string): Promise<{ ok: boolean }> =>
  request('/player/name', { method: 'POST', body: JSON.stringify({ playerId, name }) });

export const fetchLeaderboard = (
  puzzleId: string,
): Promise<{ par: number; entries: LeaderboardEntry[] }> => request(`/leaderboard/${puzzleId}`);
