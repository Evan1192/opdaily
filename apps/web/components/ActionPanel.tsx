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

export function ActionPanel({ choices, pending, onAction, onChoice, onCancel }: Props) {
  if (pending) {
    return (
      <div className="rounded-lg bg-indigo-950/80 p-3">
        <div className="mb-2 text-sm font-semibold text-indigo-200">
          {pending.prompt ?? pending.type}
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.options.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChoice(i)}
              className="rounded bg-indigo-700 px-3 py-1 text-sm hover:bg-indigo-600"
            >
              {pendingLabel(pending, i)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (choices.length === 0) return null;
  return (
    <div className="rounded-lg bg-slate-900/80 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">Choose an action</span>
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300">
          cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onAction(c.key)}
            className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
