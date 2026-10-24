'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchState, fetchToday, sendAction, sendReset, sendUndo, setName, startSession } from '@/lib/api';
import { playerId, recordWin, resetIdentity, saveName, savedName } from '@/lib/identity';
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

/**
 * Renders children at a fixed design width and scales them down (never up)
 * so the whole board always fits inside the available space — no scrolling.
 */
const DESIGN_W = 896; // px — matches max-w-4xl
function FitScale({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const measure = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      setScale(Math.min(outer.clientWidth / DESIGN_W, outer.clientHeight / inner.offsetHeight, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div ref={innerRef} className="shrink-0" style={{ width: DESIGN_W, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** Celebration burst behind the win poster: falling brass/crimson flecks and skulls. */
const CONFETTI_GLYPHS = ['☠', '●', '◆', '★'];
function Confetti() {
  // Random layout generated once per mount — the overlay only mounts on win.
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.6,
        size: 10 + Math.random() * 14,
        glyph: CONFETTI_GLYPHS[i % CONFETTI_GLYPHS.length],
        color: i % 3 === 0 ? '#f0d48a' : i % 3 === 1 ? '#f26d6d' : '#e3bb5f',
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute -top-8 animate-confetti"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            color: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const [puzzle, setPuzzle] = useState<PuzzleInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setNameInput] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [streak, setStreak] = useState(0);
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

  // Record the daily streak the moment today's puzzle is won.
  useEffect(() => {
    if (state?.won && puzzle) setStreak(recordWin(puzzle.date));
  }, [state?.won, puzzle]);

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
    <main className="mx-auto flex h-full max-w-4xl flex-col px-3 pt-2 sm:px-4">
      {/* Top bar */}
      <header className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-2">
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

      {/* Objective banner — tells a new player exactly what to do */}
      {!done && (
        <div className="mb-1 flex shrink-0 items-center justify-center gap-2 rounded-lg border border-brass-700/50 bg-sea-900/80 px-3 py-1.5 text-center">
          <span className="font-display text-sm tracking-wide text-brass-300 sm:text-base">
            ☠ Take down the enemy leader
          </span>
          <span className="rounded-full bg-sea-800 px-2.5 py-0.5 text-xs font-semibold text-slate-200 ring-1 ring-sea-600">
            {state.maxActions - state.actionsSpent} action{state.maxActions - state.actionsSpent === 1 ? '' : 's'} left
          </span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 animate-overlay-in rounded-lg bg-bounty-900 px-4 py-2 text-sm text-red-100 shadow-glow-combat ring-1 ring-bounty-600">
          {error}
        </div>
      )}

      {/* Board — scaled to fit the remaining viewport space, never scrolls */}
      <div className="relative min-h-0 flex-1">
        <FitScale>
          <Board
            view={state.view}
            selected={selected}
            targets={targets}
            actionable={done ? new Set() : actionable}
            onCard={onCard}
          />
        </FitScale>
        {/* Nudge hint floats just above your side of the board, next to the glowing cards */}
        {!done && !selected && !state.pending && actionable.size > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="animate-bounce-soft rounded-full bg-emerald-900/90 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-glow-target ring-1 ring-emerald-500">
              👆 Tap a glowing card to act
            </span>
          </div>
        )}
      </div>

      {/* Command bar — pinned bottom */}
      {!done && (
        <div className="z-40 -mx-3 shrink-0 border-t border-sea-700 bg-sea-950/95 backdrop-blur sm:-mx-4">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 p-2 sm:p-3">
            <div className="min-w-0 flex-1">
              <ActionPanel
                choices={selectedActions.map((a) => ({ key: a.key, label: describe(a.key, names) }))}
                pending={state.pending}
                onAction={(key) => void apply({ key })}
                onChoice={(choice) => void apply({ choice })}
                onCancel={() => setSelected(null)}
              />

            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void undo()}
                className="rounded-full bg-sea-800 px-4 py-2 text-sm font-medium text-slate-200 ring-1 ring-sea-600 transition-all hover:-translate-y-0.5 hover:bg-sea-700"
              >
                ↩ Undo
              </button>
              <button
                type="button"
                onClick={() => void reset()}
                className="rounded-full bg-sea-800 px-4 py-2 text-sm font-medium text-slate-200 ring-1 ring-sea-600 transition-all hover:-translate-y-0.5 hover:bg-sea-700"
              >
                ⟳ Reset
              </button>
              {endTurnAction && (
                <button
                  type="button"
                  onClick={() => void apply({ key: 'endTurn' })}
                  className="rounded-full bg-gradient-to-b from-bounty-500 to-bounty-700 px-5 py-2 text-sm font-bold text-white shadow-[0_2px_12px_rgba(220,59,59,0.4)] ring-1 ring-bounty-400 transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(220,59,59,0.55)]"
                >
                  End turn ⏭
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Win / lose payoff overlay */}
      {done && (
        <div className="fixed inset-0 z-50 flex animate-overlay-in items-start justify-center overflow-y-auto bg-sea-950/90 p-4 sm:items-center">
          {state.won && <Confetti />}
          {state.won ? (
            <div className="relative z-[56] my-8 w-full max-w-lg animate-poster-in rounded-2xl border-2 border-brass-600 bg-sea-900 p-6 shadow-[0_0_60px_rgba(201,155,63,0.25)] sm:my-0">
              <div className="text-center">
                <div className="font-display text-6xl tracking-wider text-brass-300">LETHAL.</div>
                {streak > 0 && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sea-800 px-3 py-0.5 text-sm font-semibold text-brass-300 ring-1 ring-brass-700/60">
                    🔥 {streak}-day streak
                  </div>
                )}
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
              {/* TESTING ONLY — new anonymous identity = fresh attempt. Remove before launch. */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetIdentity();
                    window.location.reload();
                  }}
                  className="text-xs text-sea-600 underline decoration-dotted underline-offset-2 hover:text-slate-400"
                >
                  [test] redo puzzle as new player
                </button>
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
              {/* TESTING ONLY — new anonymous identity = fresh attempt. Remove before launch. */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetIdentity();
                    window.location.reload();
                  }}
                  className="text-xs text-sea-600 underline decoration-dotted underline-offset-2 hover:text-slate-400"
                >
                  [test] redo puzzle as new player
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
