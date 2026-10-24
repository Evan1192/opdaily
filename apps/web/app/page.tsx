'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchState, fetchToday, sendAction, sendReset, sendUndo, setName, startSession } from '@/lib/api';
import { playerId, saveName, savedName } from '@/lib/identity';
import type { PuzzleInfo, SessionState } from '@/lib/types';
import { Board } from '@/components/Board';
import { ActionPanel } from '@/components/ActionPanel';
import { Leaderboard } from '@/components/Leaderboard';

// Action keys are produced by the server (`actionKey` in the puzzle package):
//   playCharacter:<card>[><replaces>] | playStage:<card> | playEvent:<card>
//   attachDon:<target> | activateAbility:<card>#<key> | declareAttack:<attacker>><target>
//   endTurn
// The id before any separator is the card the action belongs to; an id after `>` is a target.
const parseKey = (key: string): { kind: string; source: string | null; target: string | null } => {
  const [kind, rest] = key.split(':', 2) as [string, string | undefined];
  if (!rest) return { kind, source: null, target: null };
  if (kind === 'attachDon') return { kind, source: rest, target: rest };
  const hash = rest.indexOf('#');
  if (hash >= 0) return { kind, source: rest.slice(0, hash), target: null };
  const gt = rest.indexOf('>');
  if (gt >= 0) return { kind, source: rest.slice(0, gt), target: rest.slice(gt + 1) };
  return { kind, source: rest, target: null };
};

const describe = (key: string, names: Map<string, string>): string => {
  const { kind, source, target } = parseKey(key);
  const name = (id: string | null) => (id ? (names.get(id) ?? id) : '');
  switch (kind) {
    case 'declareAttack':
      return `Attack ${name(target)}`;
    case 'attachDon':
      return `Attach DON!! to ${name(source)}`;
    case 'activateAbility':
      return `Activate ability`;
    case 'playCharacter':
      return target ? `Play ${name(source)} (replace ${name(target)})` : `Play ${name(source)}`;
    case 'playStage':
      return `Play ${name(source)}`;
    case 'playEvent':
      return `Play ${name(source)}`;
    case 'endTurn':
      return 'End turn';
    default:
      return key;
  }
};

const fmtClock = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Home() {
  const [puzzle, setPuzzle] = useState<PuzzleInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setNameInput] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    const boot = async () => {
      try {
        const info = await fetchToday();
        setPuzzle(info);
        const session = await startSession(info.id, playerId());
        setSessionId(session.sessionId);
        setState(await fetchState(session.sessionId));
        startRef.current = Date.now();
        setNameInput(savedName() ?? '');
        setNameSaved(savedName() !== null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };
    void boot();
  }, []);

  const done = state?.won || state?.failed || state?.solved;

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => clearInterval(t);
  }, [done]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    if (!state) return map;
    const add = (c: { instanceId: string; name: string } | null) => c && map.set(c.instanceId, c.name);
    for (const side of [state.view.you, state.view.opponent]) {
      add(side.leader);
      side.characters.forEach(add);
      add(side.stage);
      side.hand?.forEach(add);
      side.life.forEach((c) => c && add(c));
    }
    return map;
  }, [state]);

  // Cards that own at least one legal action.
  const actionable = useMemo(() => {
    const set = new Set<string>();
    for (const a of state?.actions ?? []) {
      const { source } = parseKey(a.key);
      if (source) set.add(source);
    }
    return set;
  }, [state]);

  // When a card is selected: its actions, plus the attack/don targets those actions point at.
  const selectedActions = useMemo(
    () => (selected ? (state?.actions ?? []).filter((a) => parseKey(a.key).source === selected) : []),
    [state, selected],
  );
  const targets = useMemo(() => {
    const set = new Set<string>();
    for (const a of selectedActions) {
      const { target } = parseKey(a.key);
      if (target && target !== selected) set.add(target);
    }
    return set;
  }, [selectedActions, selected]);

  const apply = useCallback(
    async (move: { key: string } | { choice: number }) => {
      if (!sessionId) return;
      setError(null);
      try {
        setState(await sendAction(sessionId, move));
        setSelected(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Move failed');
      }
    },
    [sessionId],
  );

  const onCard = useCallback(
    (instanceId: string) => {
      if (!state) return;
      if (selected === instanceId) {
        setSelected(null);
        return;
      }
      if (selected && targets.has(instanceId)) {
        // Clicking a highlighted target resolves to the unique action aimed at it.
        const match = selectedActions.find((a) => parseKey(a.key).target === instanceId);
        if (match) {
          void apply({ key: match.key });
          return;
        }
      }
      setSelected(actionable.has(instanceId) ? instanceId : null);
    },
    [state, selected, targets, selectedActions, actionable, apply],
  );

  const undo = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      setState(await sendUndo(sessionId));
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Undo failed');
    }
  }, [sessionId]);

  const reset = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      setState(await sendReset(sessionId));
      setSelected(null);
      startRef.current = Date.now();
      setElapsed(0);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reset failed');
    }
  }, [sessionId]);

  const shareText = useMemo(() => {
    if (!puzzle || !state?.won) return '';
    return `🏴‍☠️ OPDaily ${puzzle.date} — ${state.actionsSpent}/${state.par} actions`;
  }, [puzzle, state]);

  if (error && !state) {
    return <main className="mx-auto max-w-3xl p-6 text-bounty-400">{error}</main>;
  }
  if (!puzzle || !state) {
    return (
      <main className="mx-auto max-w-3xl p-6 font-display text-lg tracking-wide text-brass-600">
        Charting today’s waters…
      </main>
    );
  }

  const endTurnAction = state.actions.find((a) => a.key === 'endTurn');
  const atPar = state.actionsSpent === state.par;
  const diffBadge =
    puzzle.difficulty === 'easy'
      ? 'bg-emerald-900/60 text-emerald-300 ring-emerald-700'
      : puzzle.difficulty === 'medium'
        ? 'bg-amber-900/60 text-amber-300 ring-amber-700'
        : 'bg-bounty-900/60 text-bounty-400 ring-bounty-700';

  return (
    <main className="mx-auto max-w-4xl p-3 pb-24 sm:p-4 sm:pb-24">
      {/* Top bar */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl tracking-wide text-brass-300">
            ☠ OPDaily
          </h1>
          <div className="flex flex-col">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              {puzzle.date} · {puzzle.title}
              <span
                className={`rounded-full px-2 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ${diffBadge}`}
              >
                {puzzle.difficulty}
              </span>
            </span>
            {puzzle.flavor && <span className="text-xs italic text-sea-600">{puzzle.flavor}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums">
            <span className={state.actionsSpent > state.par ? 'text-bounty-400' : 'text-brass-300'}>
              {state.actionsSpent}
            </span>
            <span className="text-sm font-normal text-slate-500"> / par {state.par}</span>
          </div>
          {!done && (
            <div className="font-mono text-xs tabular-nums text-slate-500">{fmtClock(elapsed)}</div>
          )}
        </div>
      </header>

      {/* Error toast */}
      {error && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-overlay-in rounded-lg bg-bounty-900 px-4 py-2 text-sm text-red-100 shadow-glow-combat ring-1 ring-bounty-600">
          {error}
        </div>
      )}

      <Board
        view={state.view}
        selected={selected}
        targets={targets}
        actionable={done ? new Set() : actionable}
        onCard={onCard}
      />

      {/* Command bar — sticky bottom */}
      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sea-700 bg-sea-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 p-2 sm:p-3">
            <div className="min-w-0 flex-1">
              <ActionPanel
                choices={selectedActions.map((a) => ({ key: a.key, label: describe(a.key, names) }))}
                pending={state.pending}
                onAction={(key) => void apply({ key })}
                onChoice={(choice) => void apply({ choice })}
                onCancel={() => setSelected(null)}
              />
              {selectedActions.length === 0 && !state.pending && (
                <span className="text-xs text-sea-600">
                  Tap a glowing card to see its orders.
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void undo()}
                className="rounded-lg bg-sea-800 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-sea-600 transition-colors hover:bg-sea-700"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => void reset()}
                className="rounded-lg bg-sea-800 px-3 py-1.5 text-sm text-slate-300 ring-1 ring-sea-600 transition-colors hover:bg-sea-700"
              >
                Reset
              </button>
              {endTurnAction && (
                <button
                  type="button"
                  onClick={() => void apply({ key: 'endTurn' })}
                  className="rounded-lg bg-bounty-700 px-3 py-1.5 text-sm font-semibold text-red-100 ring-1 ring-bounty-500 transition-colors hover:bg-bounty-600"
                >
                  ⏭ End turn
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Win / lose payoff overlay */}
      {done && (
        <div className="fixed inset-0 z-50 flex animate-overlay-in items-start justify-center overflow-y-auto bg-sea-950/90 p-4 sm:items-center">
          {state.won ? (
            <div className="my-8 w-full max-w-lg animate-poster-in rounded-2xl border-2 border-brass-600 bg-sea-900 p-6 shadow-[0_0_60px_rgba(201,155,63,0.25)] sm:my-0">
              <div className="text-center">
                <div className="font-display text-6xl tracking-wider text-brass-300">LETHAL.</div>
                <div className="mt-2 text-sm text-slate-300">
                  {atPar ? (
                    <span className="text-brass-400">👑 Bounty claimed at par — {state.par} actions.</span>
                  ) : (
                    <>
                      {state.actionsSpent} actions <span className="text-slate-500">(par {state.par})</span>
                    </>
                  )}
                </div>
              </div>
              {state.teaches && (
                <p className="mt-4 rounded-lg border border-brass-700/50 bg-sea-850 p-3 text-sm leading-relaxed text-slate-200">
                  {state.teaches}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(shareText)}
                  className="rounded-lg bg-brass-600 px-4 py-1.5 text-sm font-semibold text-sea-950 transition-colors hover:bg-brass-500"
                >
                  Copy result
                </button>
                <span className="truncate text-xs text-slate-500">{shareText}</span>
              </div>
              {!nameSaved && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!name.trim()) return;
                    void setName(playerId(), name.trim()).then(() => {
                      saveName(name.trim());
                      setNameSaved(true);
                    });
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={24}
                    placeholder="Name for the bounty board"
                    className="flex-1 rounded-lg bg-sea-800 px-3 py-1.5 text-sm ring-1 ring-sea-600 placeholder:text-sea-600 focus:outline-none focus:ring-brass-500"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-sea-700 px-4 py-1.5 text-sm text-slate-200 transition-colors hover:bg-sea-600"
                  >
                    Save
                  </button>
                </form>
              )}
              <div className="mt-5 border-t border-brass-900/60 pt-3">
                <h2 className="mb-2 font-display text-lg tracking-widest text-brass-500">
                  BOUNTY BOARD
                </h2>
                <Leaderboard puzzleId={puzzle.id} />
              </div>
            </div>
          ) : (
            <div className="my-8 w-full max-w-md animate-poster-in rounded-2xl border border-sea-600 bg-sea-900 p-6 sm:my-0">
              <div className="text-center">
                <div className="font-display text-4xl tracking-wide text-slate-400">
                  The line slipped away.
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {state.solved ? 'Already attempted today — the sea remembers.' : 'No lethal — the window closed.'}
                </p>
              </div>
              {!state.solved && (
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => void reset()}
                    className="rounded-lg bg-bounty-700 px-6 py-2 font-semibold text-red-100 ring-1 ring-bounty-500 transition-colors hover:bg-bounty-600"
                  >
                    Reset and try again
                  </button>
                </div>
              )}
              <div className="mt-5 border-t border-sea-700 pt-3">
                <h2 className="mb-2 font-display text-lg tracking-widest text-sea-600">
                  BOUNTY BOARD
                </h2>
                <Leaderboard puzzleId={puzzle.id} />
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
