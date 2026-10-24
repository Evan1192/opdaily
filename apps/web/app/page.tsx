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
    return <main className="mx-auto max-w-3xl p-6 text-red-300">{error}</main>;
  }
  if (!puzzle || !state) {
    return <main className="mx-auto max-w-3xl p-6 text-slate-400">Loading today’s puzzle…</main>;
  }

  const endTurnAction = state.actions.find((a) => a.key === 'endTurn');

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">🏴‍☠️ OPDaily</h1>
          <p className="text-sm text-slate-400">
            {puzzle.date} · {puzzle.title} · <span className="capitalize">{puzzle.difficulty}</span>
          </p>
          {puzzle.flavor && <p className="text-xs italic text-slate-500">{puzzle.flavor}</p>}
        </div>
        <div className="text-right text-sm">
          <div>
            Actions <span className="font-bold">{state.actionsSpent}</span>
            <span className="text-slate-500"> / par {state.par}</span>
          </div>
          {!done && <div className="tabular-nums text-slate-400">{fmtClock(elapsed)}</div>}
        </div>
      </header>

      {state.won ? (
        <section className="mb-4 rounded-lg bg-emerald-950/70 p-4">
          <h2 className="text-lg font-bold text-emerald-300">
            Lethal! {state.actionsSpent === state.par ? 'Perfect — par.' : `${state.actionsSpent} actions (par ${state.par}).`}
          </h2>
          {state.teaches && <p className="mt-2 text-sm text-emerald-100">{state.teaches}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shareText)}
              className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600"
            >
              Copy result
            </button>
            <span className="text-xs text-slate-400">{shareText}</span>
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
                placeholder="Name for the leaderboard"
                className="rounded bg-slate-800 px-2 py-1 text-sm"
              />
              <button type="submit" className="rounded bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">
                Save
              </button>
            </form>
          )}
        </section>
      ) : state.failed || state.solved ? (
        <section className="mb-4 rounded-lg bg-red-950/70 p-4">
          <h2 className="text-lg font-bold text-red-300">
            {state.solved ? 'Already solved today.' : 'No lethal — the window closed.'}
          </h2>
          {!state.solved && (
            <button
              type="button"
              onClick={() => void reset()}
              className="mt-2 rounded bg-red-800 px-3 py-1 text-sm hover:bg-red-700"
            >
              Reset and try again
            </button>
          )}
        </section>
      ) : null}

      {error && <div className="mb-3 rounded bg-red-950/70 px-3 py-1 text-sm text-red-200">{error}</div>}

      <Board
        view={state.view}
        selected={selected}
        targets={targets}
        actionable={done ? new Set() : actionable}
        onCard={onCard}
      />

      <div className="mt-4 flex flex-col gap-3">
        {!done && (
          <ActionPanel
            choices={selectedActions.map((a) => ({ key: a.key, label: describe(a.key, names) }))}
            pending={state.pending}
            onAction={(key) => void apply({ key })}
            onChoice={(choice) => void apply({ choice })}
            onCancel={() => setSelected(null)}
          />
        )}
        {!done && (
          <div className="flex gap-2">
            {endTurnAction && (
              <button
                type="button"
                onClick={() => void apply({ key: 'endTurn' })}
                className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
              >
                End turn (give up the line)
              </button>
            )}
            <button
              type="button"
              onClick={() => void undo()}
              className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => void reset()}
              className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-300 hover:bg-slate-700"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      <section className="mt-6 rounded-lg bg-slate-900/60 p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Leaderboard</h2>
        <Leaderboard puzzleId={puzzle.id} />
      </section>
    </main>
  );
}
