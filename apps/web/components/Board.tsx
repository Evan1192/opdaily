'use client';

import type { GameView, PlayerView } from '@/lib/types';
import { Card, CardBack } from './Card';

interface Props {
  view: GameView;
  selected: string | null;
  /** Instance ids involved in the selected card's legal actions. */
  targets: Set<string>;
  actionable: Set<string>;
  onCard: (instanceId: string) => void;
}

const DonRow = ({ player }: { player: PlayerView }) => {
  const unattached = player.don.filter((d) => !d.attachedTo);
  return (
    <div className="flex items-center gap-1 text-xs text-amber-300">
      <span className="font-bold">DON!!</span>
      {unattached.map((d) => (
        <span
          key={d.donId}
          className={`inline-block h-5 w-5 rounded-full text-center leading-5 ${
            d.state === 'active' ? 'bg-amber-500 text-black' : 'bg-amber-900'
          }`}
        >
          ●
        </span>
      ))}
      <span className="ml-1 text-slate-400">deck {player.donDeckCount}</span>
    </div>
  );
};

const LifeStack = ({ player }: { player: PlayerView }) => (
  <div className="flex flex-col items-center gap-1">
    <span className="text-[10px] uppercase tracking-wide text-slate-400">Life {player.life.length}</span>
    <div className="flex flex-col -space-y-9">
      {player.life.map((card, i) =>
        card ? <Card key={card.instanceId} card={card} small /> : <CardBack key={i} small />,
      )}
    </div>
  </div>
);

export function Board({ view, selected, targets, actionable, onCard }: Props) {
  const cardProps = (instanceId: string) => ({
    selected: selected === instanceId,
    highlight: targets.has(instanceId) || (selected === null && actionable.has(instanceId)),
    onClick: targets.has(instanceId) || actionable.has(instanceId) || selected === instanceId
      ? () => onCard(instanceId)
      : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Opponent */}
      <section className="rounded-lg bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>Opponent — deck {view.opponent.deckCount}, trash {view.opponent.trash.length}</span>
          {view.opponent.hand !== null ? (
            <span>hand (known)</span>
          ) : (
            <span>hand {view.opponent.handCount}</span>
          )}
        </div>
        {view.opponent.hand !== null && view.opponent.hand.length > 0 && (
          <div className="mb-2 flex gap-1">
            {view.opponent.hand.map((c) => (
              <Card key={c.instanceId} card={c} small />
            ))}
          </div>
        )}
        <div className="flex items-start gap-4">
          <LifeStack player={view.opponent} />
          <Card card={view.opponent.leader} {...cardProps(view.opponent.leader.instanceId)} />
          <div className="flex flex-wrap gap-2">
            {view.opponent.characters.map((c) => (
              <Card key={c.instanceId} card={c} {...cardProps(c.instanceId)} />
            ))}
          </div>
          {view.opponent.stage && <Card card={view.opponent.stage} small />}
        </div>
      </section>

      {/* Combat banner */}
      {view.combat && (
        <div className="rounded bg-red-950/70 px-3 py-1 text-center text-sm text-red-200">
          Attack: {view.combat.attackerPower} vs {view.combat.targetPower}
          {view.combat.blocked ? ' (blocked)' : ''}
        </div>
      )}

      {/* You */}
      <section className="rounded-lg bg-slate-900/60 p-3">
        <div className="flex items-start gap-4">
          <LifeStack player={view.you} />
          <Card card={view.you.leader} {...cardProps(view.you.leader.instanceId)} />
          <div className="flex flex-wrap gap-2">
            {view.you.characters.map((c) => (
              <Card key={c.instanceId} card={c} {...cardProps(c.instanceId)} />
            ))}
          </div>
          {view.you.stage && (
            <Card card={view.you.stage} {...cardProps(view.you.stage.instanceId)} small />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <DonRow player={view.you} />
          <span className="text-xs text-slate-400">
            deck {view.you.deckCount} · trash {view.you.trash.length}
          </span>
        </div>
        {view.you.hand && view.you.hand.length > 0 && (
          <div className="mt-3 border-t border-slate-800 pt-3">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">Hand</span>
            <div className="flex flex-wrap gap-2">
              {view.you.hand.map((c) => (
                <Card key={c.instanceId} card={c} {...cardProps(c.instanceId)} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
