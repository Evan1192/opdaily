'use client';

import type { PendingInfo } from '@/lib/types';

interface ActionChoice {
  key: string;
  label: string;
}

interface Props {
  /** Legal actions for the selected card (or standalone, e.g. end turn). */
  choices: ActionChoice[];
  pending: PendingInfo | null;
  onAction: (key: string) => void;
  onChoice: (index: number) => void;
  onCancel: () => void;
}

const pendingLabel = (pending: PendingInfo, index: number): string => {
  const option = pending.options[index] as Record<string, unknown> | undefined;
  if (!option) return `Option ${index + 1}`;
  switch (option.type) {
    case 'ChooseTargets':
      return `Targets: ${(option.indices as number[]).map((i) => i + 1).join(', ') || 'none'}`;
    case 'ChooseOption': {
      const labels = pending.request.options as string[] | undefined;
      return labels?.[option.index as number] ?? `Option ${(option.index as number) + 1}`;
    }
    case 'ChooseOrder':
      return `Order: ${(option.order as number[]).map((i) => i + 1).join(' → ')}`;
    case 'ChooseBlocker':
      return option.index === null ? 'No block' : `Block with #${(option.index as number) + 1}`;
    case 'CounterStep':
      return `Counter option ${(option.index as number) + 1}`;
    default:
      return `Option ${index + 1}`;
  }
};

/** Icon for an action key's kind — read off the key prefix. */
const kindIcon = (key: string): string => {
  if (key.startsWith('declareAttack')) return '⚔';
  if (key.startsWith('attachDon')) return '◉';
  if (key.startsWith('activateAbility')) return '✦';
  if (key === 'endTurn') return '⏭';
  return '▸';
};

export function ActionPanel({ choices, pending, onAction, onChoice, onCancel }: Props) {
  // Pending decisions are the one moment that should interrupt: centered modal.
  if (pending) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-sea-950/80 p-4 animate-overlay-in">
        <div className="w-full max-w-md rounded-xl bg-sea-900 p-5 shadow-2xl ring-1 ring-brass-600/60 animate-poster-in">
          <h2 className="mb-1 font-display text-xl tracking-wide text-brass-300">Decision</h2>
          <p className="mb-4 text-sm text-slate-300">{pending.prompt ?? pending.type}</p>
          <div className="flex flex-col gap-2">
            {pending.options.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChoice(i)}
                className="min-h-11 rounded-lg bg-sea-800 px-4 py-2 text-left text-sm text-slate-100 ring-1 ring-sea-600 transition-colors hover:bg-sea-700 hover:ring-brass-500"
              >
                {pendingLabel(pending, i)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (choices.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sea-900/95 p-2.5 ring-1 ring-sea-700 sm:p-3">
      <span className="mr-1 hidden font-display text-xs tracking-widest text-brass-500 sm:inline">
        ORDERS
      </span>
      {choices.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onAction(c.key)}
          className={
            c.key === 'endTurn'
              ? 'ml-auto min-h-11 rounded-lg bg-bounty-700 px-3 py-1.5 text-sm font-semibold text-red-100 ring-1 ring-bounty-500 transition-colors hover:bg-bounty-600'
              : 'min-h-11 rounded-lg bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-emerald-50 ring-1 ring-emerald-600 transition-colors hover:bg-emerald-700'
          }
        >
          <span className="mr-1.5 text-brass-300">{kindIcon(c.key)}</span>
          {c.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 px-2 text-xs text-slate-500 transition-colors hover:text-slate-300"
      >
        cancel
      </button>
    </div>
  );
}
