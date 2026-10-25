'use client';

import { useEffect, useRef, useState } from 'react';
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
  <span className="block truncate text-center font-display text-[0.5rem] uppercase tracking-widest text-sea-600 sm:text-[0.5625rem]">
    {children}
  </span>
);

/**
 * A single-card zone cell: fixed card aspect so the mat keeps its proportions.
 * The label only renders on empty slots — occupied slots don't need the extra
 * height (FitScale is height-bound, so every label shrinks the whole board).
 */
const Slot = ({
  label,
  children,
  compact,
}: {
  label: string;
  children?: React.ReactNode;
  /** Render the card at ~65% width — for pile rows that shouldn't set the row height. */
  compact?: boolean;
}) => (
  <div className="min-w-0 [direction:ltr]">
    <div className={`relative ${compact ? 'mx-auto w-[65%]' : 'w-full'}`}>
      {children ?? (
        <div className="zone-slot w-full aspect-[600/838] opacity-50">{label}</div>
      )}
    </div>
    {!children && <ZoneLabel>{label}</ZoneLabel>}
  </div>
);

const CountBadge = ({ n }: { n: number }) => (
  <span className="absolute -bottom-1 -right-1 z-10 rounded-full bg-sea-950 px-1.5 text-[0.625rem] font-bold tabular-nums text-slate-300 ring-1 ring-sea-600">
    {n}
  </span>
);

/** Mini card-shaped DON!! tokens living in the cost area, like the official sim. */
const DonCards = ({ player }: { player: PlayerView }) => {
  const unattached = player.don.filter((d) => !d.attachedTo);
  if (unattached.length === 0) {
    return <span className="text-[0.625rem] text-sea-600">no DON!!</span>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
      {unattached.map((d) => (
        <span
          key={d.donId}
          title={d.state === 'active' ? 'Active DON!!' : 'Rested DON!!'}
          className={`flex aspect-[600/838] w-16 items-center justify-center rounded-md border transition-all duration-200 sm:w-20 ${
            d.state === 'rested' ? 'rotate-90' : ''
          } ${
            d.state === 'active'
              ? 'border-brass-400 bg-gradient-to-br from-sea-850 to-sea-950 shadow-[0_0_8px_rgba(227,187,95,0.45)]'
              : 'border-brass-700/40 bg-sea-950 opacity-60'
          }`}
        >
          <span
            className={`font-display text-sm font-bold tracking-tight sm:text-base ${
              d.state === 'active' ? 'text-brass-300' : 'text-brass-700'
            }`}
          >
            DON!!
          </span>
        </span>
      ))}
    </div>
  );
};

/**
 * Life as an upright stack on the mat edge: top card fully visible, the rest
 * peek out beneath it — like the OPLAY simulator.
 */
const LifeStack = ({ player }: { player: PlayerView }) => {
  // Flinch with a damage pop whenever this stack loses a card.
  const prevLife = useRef(player.life.length);
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (player.life.length < prevLife.current) {
      setHit(true);
      const t = setTimeout(() => setHit(false), 600);
      prevLife.current = player.life.length;
      return () => clearTimeout(t);
    }
    prevLife.current = player.life.length;
  }, [player.life.length]);

  return (
    <div
      className={`flex w-[13%] shrink-0 flex-col items-center gap-1 rounded-lg border border-bounty-600/40 p-1 [direction:ltr] ${hit ? 'animate-damage-pop' : ''}`}
    >
      {/* Life count is tier-1 info — it must survive the FitScale shrink. */}
      <span className="font-display text-[0.6875rem] font-bold tracking-widest text-bounty-400 sm:text-[0.8125rem]">
        LIFE · {player.life.length}
      </span>
      {player.life.length === 0 ? (
        <div className="zone-slot aspect-[600/838] w-full !border-bounty-600/60 !text-bounty-500">0</div>
      ) : (
        <div className="flex w-full flex-col">
          {player.life.map((card, i) => (
            <div
              key={card ? card.instanceId : i}
              className={`relative w-full ${i > 0 ? 'mt-[-115%]' : ''}`}
              style={{ zIndex: player.life.length - i }}
            >
              {card ? <Card card={card} fluid /> : <CardBack fluid />}
            </div>
          ))}
        </div>
      )}
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
    // Live combat: the attacker lunges, the target takes the hit.
    fx:
      view.combat?.attacker === instanceId
        ? ('lunge' as const)
        : view.combat?.target === instanceId
          ? ('hit' as const)
          : undefined,
  });

  /**
   * One player's seat, laid out like the official playmat — three rows:
   *   row 1 — CHARACTER AREA (5 slots, full width)
   *   row 2 — [space] · LEADER · STAGE · DECK · [space]
   *   row 3 — DON!! DECK · COST AREA (span 3) · TRASH
   * LIFE sits as an upright overlapping stack on the near edge.
   * `flipped` renders the opponent's seat rotated 180°.
   * The height cost of the third row is paid for at the page level: all
   * chrome lives in a sidebar so the board gets the full viewport height.
   */
  const mat = (player: PlayerView, interactive: boolean, flipped: boolean) => {
    // Horizontal gaps are deliberately generous: FitScale is height-bound, so
    // horizontal air lowers the design height-to-width ratio and the whole
    // board renders wider at the same viewport height.
    const charArea = (
      <div className="grid grid-cols-5 gap-3 sm:gap-10 [direction:ltr]">
        {player.characters.map((c) => (
          <div key={c.instanceId} className="min-w-0">
            <Card card={c} fluid pop {...(interactive ? cardProps(c.instanceId) : {})} />
          </div>
        ))}
        {Array.from({ length: Math.max(0, 5 - player.characters.length) }, (_, i) => (
          <div key={i} className="zone-slot w-full aspect-[600/838] opacity-50">CHAR</div>
        ))}
      </div>
    );

    const midRow = (
      <div className={`grid grid-cols-5 items-start gap-3 sm:gap-10 ${flipped ? '[direction:rtl]' : ''}`}>
        <div />
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
              pop
              {...(interactive ? cardProps(player.stage.instanceId) : {})}
            />
          ) : undefined}
        </Slot>
        <Slot label="deck">
          {player.deckCount > 0 ? (
            <div className="relative">
              <CardBack fluid />
              <CountBadge n={player.deckCount} />
            </div>
          ) : undefined}
        </Slot>
        <div />
      </div>
    );

    // Cost area spans the middle of the bottom row: DON!! cards with the
    // state summary + label along the bottom edge, like the official sim.
    const active = player.don.filter((d) => d.state === 'active' && !d.attachedTo).length;
    const rested = player.don.filter((d) => d.state === 'rested' && !d.attachedTo).length;
    const attached = player.don.filter((d) => d.attachedTo).length;
    const topTrash = player.trash[player.trash.length - 1];
    const bottomRow = (
      <div className={`grid grid-cols-5 items-stretch gap-3 sm:gap-10 ${flipped ? '[direction:rtl]' : ''}`}>
        <Slot label="don!! deck" compact>
          {player.donDeckCount > 0 ? (
            <div className="relative">
              <CardBack fluid />
              <CountBadge n={player.donDeckCount} />
            </div>
          ) : undefined}
        </Slot>
        <div className="col-span-3 min-w-0 [direction:ltr]">
          <div className="relative flex h-full items-center justify-center gap-2 rounded-lg border border-sea-600/60 bg-sea-950/40 px-2 pb-3 pt-1">
            <DonCards player={player} />
            <span className="absolute bottom-0.5 left-1.5 text-[0.5rem] tabular-nums text-sea-600 sm:text-[0.5625rem]">
              Active: {active} · Rested: {rested} · Attached: {attached}
            </span>
            <span className="absolute bottom-0.5 right-1.5 font-display text-[0.5rem] uppercase tracking-widest text-sea-600 sm:text-[0.5625rem]">
              cost area
            </span>
          </div>
        </div>
        <Slot label="trash" compact>
          {topTrash ? (
            <div key={topTrash.instanceId} className="relative">
              <Card card={topTrash} fluid pop />
              <CountBadge n={player.trash.length} />
            </div>
          ) : undefined}
        </Slot>
      </div>
    );

    const rows = flipped ? [bottomRow, midRow, charArea] : [charArea, midRow, bottomRow];
    return (
      <div className={`flex items-start gap-2 sm:gap-4 ${flipped ? 'flex-row-reverse' : ''}`}>
        <LifeStack player={player} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5">
          {rows.map((row, i) => (
            <div key={i}>{row}</div>
          ))}
        </div>
      </div>
    );
  };

  return (
    // pt-4 leaves room for the opponent hand overhanging the seat's top edge.
    <div className="flex flex-col gap-1 pt-4">
      {/* Opponent seat, rotated to face you across the table. The seat label and
          hand straddle the top edge instead of taking a row of their own —
          FitScale is height-bound, so every row shrinks the whole board. */}
      <section className="relative rounded-xl bg-sea-900/80 px-3 py-1 shadow-mat ring-1 ring-brass-700/50 sm:px-5 sm:py-1.5">
        <span className="pointer-events-none absolute left-2 top-1 z-10 font-display text-[0.625rem] tracking-widest text-bounty-400">
          OPPONENT
        </span>
        {/* Hand card-backs overlap the seat's outer edge, like cards held across the table. */}
        <div className="pointer-events-none absolute -top-5 left-1/2 z-10 flex -translate-x-1/2 items-end gap-1">
          {view.opponent.hand !== null && view.opponent.hand.length > 0 ? (
            view.opponent.hand.map((c) => <Card key={c.instanceId} card={c} small />)
          ) : view.opponent.handCount > 0 ? (
            <>
              <span className="flex -space-x-7">
                {Array.from({ length: Math.min(view.opponent.handCount, 5) }, (_, i) => (
                  <CardBack key={i} small />
                ))}
              </span>
              <span className="text-[0.625rem] text-slate-400">×{view.opponent.handCount}</span>
            </>
          ) : null}
        </div>
        {mat(view.opponent, true, true)}
      </section>

      {/* Center divider — combat banner slots in when an attack is live. */}
      <div className="relative flex h-2 items-center">
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
      <section className="relative rounded-xl bg-sea-900/80 px-3 py-1 shadow-mat ring-1 ring-brass-600/60 sm:px-5 sm:py-1.5">
        <span className="pointer-events-none absolute right-2 top-1 z-10 font-display text-[0.625rem] tracking-widest text-brass-400">
          YOUR BOARD
        </span>
        {mat(view.you, true, false)}
        {view.you.hand && view.you.hand.length > 0 && (
          /* Fanned arc overlapping the cost strip — like a hand held at the
             table edge. Negative margin reclaims a full card row of height. */
          <div className="relative z-30 -mt-14 flex justify-center sm:-mt-16">
            {view.you.hand.map((c, i, arr) => {
              const off = i - (arr.length - 1) / 2;
              return (
                <div
                  key={c.instanceId}
                  className="relative -ml-5 transition-transform duration-200 first:ml-0 hover:z-20 sm:-ml-7"
                  style={{
                    transform: `rotate(${off * 5}deg) translateY(${Math.abs(off) * 7}px)`,
                    transformOrigin: 'bottom center',
                    zIndex: i,
                  }}
                >
                  <Card card={c} enterDelay={i * 70} {...cardProps(c.instanceId)} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
