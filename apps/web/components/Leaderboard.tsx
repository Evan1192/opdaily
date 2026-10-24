'use client';

import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '@/lib/api';
import type { LeaderboardEntry } from '@/lib/types';

const fmtTime = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export function Leaderboard({ puzzleId }: { puzzleId: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [par, setPar] = useState<number | null>(null);

  useEffect(() => {
    fetchLeaderboard(puzzleId)
      .then((b) => {
        setEntries(b.entries);
        setPar(b.par);
      })
      .catch(() => setEntries([]));
  }, [puzzleId]);

  if (entries === null) return <div className="text-sm text-slate-500">Loading leaderboard…</div>;
  if (entries.length === 0) return <div className="text-sm text-slate-500">No clears yet. Be the first.</div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-1">#</th>
          <th>Player</th>
          <th>Actions</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.rank} className="border-t border-slate-800">
            <td className="py-1">{e.rank}</td>
            <td>{e.name}</td>
            <td>
              {e.actions}
              {par !== null && e.actions === par && <span className="ml-1 text-amber-400">★ par</span>}
            </td>
            <td>{fmtTime(e.elapsedMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
