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

  if (entries === null) return <div className="text-sm text-slate-500">Loading bounty board…</div>;
  if (entries.length === 0)
    return <div className="text-sm text-slate-500">No bounties claimed yet. Be the first.</div>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left font-display text-xs tracking-widest text-brass-600">
          <th className="py-1 font-normal">#</th>
          <th className="font-normal">PIRATE</th>
          <th className="font-normal">ACTIONS</th>
          <th className="font-normal">TIME</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={e.rank}
            className={`border-t border-brass-900/60 ${
              e.rank === 1 ? 'bg-brass-900/30 text-brass-300' : ''
            }`}
          >
            <td className="py-1.5 tabular-nums">{e.rank === 1 ? '👑' : e.rank}</td>
            <td>{e.name}</td>
            <td className="tabular-nums">
              {e.actions}
              {par !== null && e.actions === par && (
                <span className="ml-1 text-brass-400">★ par</span>
              )}
            </td>
            <td className="tabular-nums">{fmtTime(e.elapsedMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
