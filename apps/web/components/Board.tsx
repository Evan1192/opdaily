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

/** Width classes matching Card so empty slots line up with filled ones. */
const SLOT_W = 'w-16 sm:w-20 md:w-24';
const SLOT_W_SMALL = 'w-12 sm:w-16';

const EmptySlot = ({ label, small }: { label: string; small?: boolean }) => (
  <div className={`zone-slot aspect-[600/838] ${small ? SLOT_W_SMALL : SLOT_W}`}>{label}</div>
);

/** Gold DON!! coins: active bright brass, rested dim; deck count as a stack. */
const DonRow = ({ player }: { player: PlayerView }) => {
  const unattached = player.don.filter((d) => !d.attachedTo);
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-display text-xs tracking-wider text-brass-500">DON!!</span>
      {unattached.map((d) => (
        <span
          key={d.donId}
          title={d.state === 'active' ? 'Active DON!!' : 'Rested DON!!'}
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            d.state === 'active'
              ? 'bg-gradient-to-br from-brass-300 to-brass-600 text-sea-950 shadow-[0_0_6px_rgba(227,187,95,0.6)]'
              : 'bg-brass-900 text-brass-700 ring-1 ring-brass-700/50'
          }`}
        >
          ●
        </span>
      ))}
      {unattached.length === 0 && <span className="text-[10px] text-sea-600">none</span>}
      {player.donDeckCount > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-sea-800 px-1.5 py-px text-[10px] text-brass-500 ring-1 ring-sea-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brass-700" />
          ×{player.donDeckCount}
        </span>
      )}
    </div>
  );
};

/** Life as a sideways stack on the mat edge, like the physical game. */
const LifeStack = ({ player }: { player: PlayerView }) => (
  <div className="flex shrink-0 flex-col items-center gap-1">
    <span className="font-display text-[10px] tracking-widest text-brass-500">
      LIFE {player.life.length}
    </span>
    {player.life.length === 0 ? (
      <div className="zone-slot h-10 w-12 sm:h-12 sm:w-14 !border-bounty-600/60 !text-bounty-500">
        0
      </div>
    ) : (
      <div className="flex flex-col -space-y-8 sm:-space-y-10">
        {player.life.map((card, i) =>
          card ? (
            <span key={card.instanceId} className="rotate-90 scale-90">
              <Card card={card} small />
            </span>
          ) : (
            <CardBack key={i} small sideways />
          ),
        )}
      </div>
    )}
  </div>
);

/** Deck + trash piles on the right edge of the mat. */
const Piles = ({ player }: { player: PlayerView }) => {
  const top = player.trash[player.trash.length - 1];
  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        {player.deckCount > 0 ? <CardBack small /> : <EmptySlot label="DECK" small />}
        <span className="absolute -bottom-1 -right-1 rounded-full bg-sea-950 px-1.5 text-[10px] font-bold tabular-nums text-slate-300 ring-1 ring-sea-600">
          {player.deckCount}
        </span>
      </div>
      <div className="relative">
        {top ? <Card card={top} small /> : <EmptySlot label="TRASH" small />}
        {player.trash.length > 0 && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-sea-950 px-1.5 text-[10px] font-bold tabular-nums text-slate-300 ring-1 ring-sea-600">
            {player.trash.length}
          </span>
        )}
      </div>
    </div>
  );
};

export function Board({ view, selected, targets, actionable, onCard }: Props) {
  const cardProps = (instanceId: string) => ({
    selected: selected === instanceId,
    highlight: targets.has(instanceId) || (selected === null && actionable.has(instanceId)),
    onClick: targets.has(instanceId) || actionable.has(instanceId) || selected === instanceId
      ? () => onCard(instanceId)
      : undefined,
  });

  const charSlots = (player: PlayerView, interactive: boolean) => (
    <div className="flex gap-1.5 sm:gap-2">
      {player.characters.map((c) => (
        <Card key={c.instanceId} card={c} {...(interactive ? cardProps(c.instanceId) : {})} />
      ))}
      {Array.from({ length: Math.max(0, 5 - player.characters.length) }, (_, i) => (
        <EmptySlot key={i} label="CHAR" />
      ))}
    </div>
  );

  const mat = (player: PlayerView, interactive: boolean) => (
    <div className="flex items-start gap-2 sm:gap-4">
      <LifeStack player={player} />
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-1.5 sm:gap-2">
          <div className="flex flex-col items-center gap-0.5">
            <Card card={player.leader} {...(interactive ? cardProps(player.leader.instanceId) : {})} />
            <span className="font-display text-[9px] tracking-widest text-sea-600">LEADER</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            {player.stage ? (
              <Card
                card={player.stage}
                {...(interactive ? cardProps(player.stage.instanceId) : {})}
              />
            ) : (
              <EmptySlot label="STAGE" />
            )}
            <span className="font-display text-[9px] tracking-widest text-sea-600">STAGE</span>
          </div>
          <div className="hidden sm:block sm:w-2" />
          {charSlots(player, interactive)}
        </div>
      </div>
      <div className="ml-auto">
        <Piles player={player} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Opponent mat (mirrored above) */}
      <section className="rounded-xl bg-sea-900/80 p-2 shadow-mat ring-1 ring-sea-700 sm:p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs tracking-widest text-bounty-400">OPPONENT</span>
          {view.opponent.hand !== null ? (
            <span className="text-[10px] uppercase tracking-wide text-slate-400">hand — known</span>
          ) : view.opponent.handCount > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="flex -space-x-7">
                {Array.from({ length: Math.min(view.opponent.handCount, 5) }, (_, i) => (
                  <CardBack key={i} small />
                ))}
              </span>
              ×{view.opponent.handCount}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-sea-600">hand empty</span>
          )}
        </div>
        {view.opponent.hand !== null && view.opponent.hand.length > 0 && (
          <div className="mb-2 flex gap-1.5">
            {view.opponent.hand.map((c) => (
              <Card key={c.instanceId} card={c} small />
            ))}
          </div>
        )}
        {mat(view.opponent, true)}
        <div className="mt-2">
          <DonRow player={view.opponent} />
        </div>
      </section>

      {/* Center divider — combat banner slots in when an attack is live. */}
      <div className="relative flex h-6 items-center">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-brass-700/60 to-transparent" />
        {view.combat && (
          <div className="absolute inset-x-0 flex justify-center">
            <span className="animate-attack-shake rounded-full bg-bounty-700 px-4 py-0.5 text-sm font-bold text-red-100 shadow-glow-combat ring-1 ring-bounty-500">
              ⚔ {view.combat.attackerPower} vs {view.combat.targetPower}
              {view.combat.blocked ? ' — blocked' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Your mat */}
      <section className="rounded-xl bg-sea-900/80 p-2 shadow-mat ring-1 ring-sea-700 sm:p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs tracking-widest text-brass-400">YOUR BOARD</span>
          <DonRow player={view.you} />
        </div>
        {mat(view.you, true)}
        {view.you.hand && view.you.hand.length > 0 && (
          <div className="mt-3 border-t border-sea-700 pt-2">
            <span className="mb-1 block font-display text-[10px] tracking-widest text-brass-500">
              HAND
            </span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
