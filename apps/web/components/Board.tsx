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

/** Label shown along the top edge of a zone. */
const ZoneLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="block truncate text-center font-display text-[8px] uppercase tracking-widest text-sea-600 sm:text-[9px]">
    {children}
  </span>
);

/** A single-card zone cell: fixed card aspect so the mat keeps its proportions. */
const Slot = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <div className="min-w-0 [direction:ltr]">
    <div className="relative w-full">
      {children ?? (
        <div className="zone-slot w-full aspect-[600/838]">{label}</div>
      )}
    </div>
    <ZoneLabel>{label}</ZoneLabel>
  </div>
);

const CountBadge = ({ n }: { n: number }) => (
  <span className="absolute -bottom-1 -right-1 z-10 rounded-full bg-sea-950 px-1.5 text-[10px] font-bold tabular-nums text-slate-300 ring-1 ring-sea-600">
    {n}
  </span>
);

/** Gold DON!! coins living in the cost area: active bright brass, rested dim. */
const DonCoins = ({ player }: { player: PlayerView }) => {
  const unattached = player.don.filter((d) => !d.attachedTo);
  if (unattached.length === 0) {
    return <span className="text-[10px] text-sea-600">no DON!!</span>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
      {unattached.map((d) => (
        <span
          key={d.donId}
          title={d.state === 'active' ? 'Active DON!!' : 'Rested DON!!'}
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold sm:h-5 sm:w-5 sm:text-[10px] ${
            d.state === 'active'
              ? 'bg-gradient-to-br from-brass-300 to-brass-600 text-sea-950 shadow-[0_0_6px_rgba(227,187,95,0.6)]'
              : 'bg-brass-900 text-brass-700 ring-1 ring-brass-700/50'
          }`}
        >
          ●
        </span>
      ))}
    </div>
  );
};

/** Life as a sideways stack on the mat edge, like the physical game. */
const LifeStack = ({ player }: { player: PlayerView }) => (
  <div className="flex w-[11%] shrink-0 flex-col items-center gap-1 [direction:ltr]">
    <span className="font-display text-[8px] tracking-widest text-brass-500 sm:text-[10px]">
      LIFE {player.life.length}
    </span>
    {player.life.length === 0 ? (
      <div className="zone-slot aspect-[838/600] w-full !border-bounty-600/60 !text-bounty-500">0</div>
    ) : (
      <div className="flex w-full flex-col gap-0.5">
        {player.life.map((card, i) => (
          <div key={card ? card.instanceId : i} className="relative w-full aspect-[838/600] overflow-hidden rounded-md">
            <div className="absolute left-1/2 top-1/2 w-[71.6%] -translate-x-1/2 -translate-y-1/2 rotate-90">
              {card ? <Card card={card} fluid /> : <CardBack fluid />}
            </div>
          </div>
        ))}
      </div>
    )}
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

  /**
   * One player's seat, laid out like the official playmat:
   *   row 1 — CHARACTER AREA (full width, 5 slots)
   *   row 2 — [phases/space] LEADER · STAGE · [space] · DECK
   *   row 3 — DON!! DECK · COST AREA · TRASH
   * with LIFE sideways along the edge. `flipped` renders the opponent's seat
   * rotated 180° (rows and columns reversed, life on the far side).
   */
  const mat = (player: PlayerView, interactive: boolean, flipped: boolean) => {
    const charArea = (
      <div className="rounded-lg border border-sea-600/60 p-1 sm:p-1.5 [direction:ltr]">
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {player.characters.map((c) => (
            <div key={c.instanceId} className="min-w-0">
              <Card card={c} fluid {...(interactive ? cardProps(c.instanceId) : {})} />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - player.characters.length) }, (_, i) => (
            <div key={i} className="zone-slot w-full aspect-[600/838]">CHAR</div>
          ))}
        </div>
        <ZoneLabel>character area</ZoneLabel>
      </div>
    );

    const midRow = (
      <div className={`grid grid-cols-6 items-start gap-1 sm:gap-2 ${flipped ? '[direction:rtl]' : ''}`}>
        <div className="col-span-2" />
        <Slot label="leader">
          <Card
            card={player.leader}
            fluid
            {...(interactive ? cardProps(player.leader.instanceId) : {})}
          />
        </Slot>
        <Slot label="stage">
          {player.stage ? (
            <Card
              card={player.stage}
              fluid
              {...(interactive ? cardProps(player.stage.instanceId) : {})}
            />
          ) : undefined}
        </Slot>
        <div />
        <Slot label="deck">
          {player.deckCount > 0 ? (
            <div className="relative">
              <CardBack fluid />
              <CountBadge n={player.deckCount} />
            </div>
          ) : undefined}
        </Slot>
      </div>
    );

    const topTrash = player.trash[player.trash.length - 1];
    const bottomRow = (
      <div className={`grid grid-cols-6 items-start gap-1 sm:gap-2 ${flipped ? '[direction:rtl]' : ''}`}>
        <Slot label="don!! deck">
          {player.donDeckCount > 0 ? (
            <div className="relative">
              <CardBack fluid />
              <CountBadge n={player.donDeckCount} />
            </div>
          ) : undefined}
        </Slot>
        <div className="col-span-4 self-stretch [direction:ltr]">
          <div className="flex min-h-full flex-col justify-center rounded-lg border border-sea-600/60 p-1.5 sm:p-2">
            <DonCoins player={player} />
          </div>
          <ZoneLabel>cost area</ZoneLabel>
        </div>
        <Slot label="trash">
          {topTrash ? (
            <div className="relative">
              <Card card={topTrash} fluid />
              <CountBadge n={player.trash.length} />
            </div>
          ) : undefined}
        </Slot>
      </div>
    );

    const rows = flipped ? [bottomRow, midRow, charArea] : [charArea, midRow, bottomRow];
    return (
      <div className={`flex gap-1.5 sm:gap-2 ${flipped ? 'flex-row-reverse' : ''}`}>
        <LifeStack player={player} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
          {rows.map((row, i) => (
            <div key={i}>{row}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Opponent seat, rotated to face you across the table */}
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
        {mat(view.opponent, true, true)}
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

      {/* Your seat */}
      <section className="rounded-xl bg-sea-900/80 p-2 shadow-mat ring-1 ring-sea-700 sm:p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs tracking-widest text-brass-400">YOUR BOARD</span>
        </div>
        {mat(view.you, true, false)}
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
