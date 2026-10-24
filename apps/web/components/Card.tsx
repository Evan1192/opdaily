'use client';

import Image from 'next/image';
import { useState } from 'react';
import { artUrl, type CardView } from '@/lib/types';

interface Props {
  card: CardView;
  selected?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  small?: boolean;
  /** Fill the parent's width — the playmat grid controls sizing. */
  fluid?: boolean;
}

/** A card: art when it loads, a text face as fallback. Rested cards rotate. */
export function Card({ card, selected, dimmed, highlight, onClick, small, fluid }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const width = fluid ? 'w-full' : small ? 'w-12 sm:w-16' : 'w-16 sm:w-20 md:w-24';
  return (
    <span
      className={`group relative inline-block ${width} animate-card-enter ${
        card.state === 'rested' && !fluid ? 'mx-2 sm:mx-3' : ''
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={[
          'relative block w-full aspect-[600/838] rounded-md overflow-hidden text-left',
          'transition-all duration-200',
          // Fluid cards live in fixed grid cells, so shrink the rotation to fit the cell.
          card.state === 'rested' ? (fluid ? 'rotate-90 scale-[0.716]' : 'rotate-90') : '',
          selected
            ? 'ring-2 ring-brass-400 shadow-glow-selected -translate-y-1'
            : highlight
              ? 'ring-2 ring-emerald-400 animate-pulse-glow'
              : 'ring-1 ring-sea-600',
          dimmed ? 'opacity-40' : '',
          onClick ? 'cursor-pointer hover:scale-105 hover:z-10' : 'cursor-default',
        ].join(' ')}
        title={`${card.name}${card.power !== null ? ` — ${card.power}` : ''}`}
      >
        {!artFailed ? (
          // The art host sends Cross-Origin-Resource-Policy: same-site, which blocks
          // direct <img> hotlinking — Next's image optimizer fetches it server-side.
          <Image
            src={artUrl(card.definitionId)}
            alt={card.name}
            fill
            sizes={small ? '64px' : '96px'}
            className="object-cover"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-between bg-sea-800 p-1 text-[9px] leading-tight">
            <div className="font-bold">{card.name}</div>
            <div>
              {card.cost !== null && <span>C{card.cost} </span>}
              {card.power !== null && <span>{card.power}</span>}
            </div>
          </div>
        )}
        {card.attachedDon > 0 && (
          <span className="absolute left-0.5 top-0.5 flex items-center gap-0.5 rounded-full bg-black/80 px-1 py-px text-[10px] font-bold text-brass-300">
            <span className="inline-block h-2 w-2 rounded-full bg-brass-400 shadow-[0_0_4px_rgba(227,187,95,0.8)]" />
            +{card.attachedDon}
          </span>
        )}
        {card.power !== null && !artFailed && (
          <span
            className={`absolute bottom-0.5 left-0.5 rounded-full bg-black/85 px-1.5 py-px text-[10px] font-bold tabular-nums ${
              card.attachedDon > 0 ? 'text-bounty-400' : 'text-brass-300'
            }`}
          >
            {card.power}
          </span>
        )}
        {card.summoningSick && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-sea-700/90 px-1 text-[9px]">zzz</span>
        )}
        {card.state === 'rested' && (
          <span className="absolute right-0.5 top-0.5 -rotate-90 rounded bg-black/80 px-1 text-[9px] text-slate-300">
            R
          </span>
        )}
      </button>
      {/* Full-size art preview on hover — desktop only, never captures the pointer. */}
      {!artFailed && (
        <span className="pointer-events-none absolute left-full top-0 z-40 ml-2 hidden w-52 lg:group-hover:block">
          <span className="relative block aspect-[600/838] overflow-hidden rounded-lg shadow-2xl ring-1 ring-brass-600/60">
            <Image src={artUrl(card.definitionId)} alt="" fill sizes="208px" className="object-cover" />
          </span>
        </span>
      )}
    </span>
  );
}

/** A face-down card back (hidden life, opponent hand count). */
export function CardBack({
  small,
  sideways,
  fluid,
}: {
  small?: boolean;
  sideways?: boolean;
  fluid?: boolean;
}) {
  return (
    <div
      className={[
        fluid ? 'w-full' : small ? 'w-10' : 'w-12 sm:w-16',
        sideways ? 'rotate-90' : '',
        'aspect-[600/838] rounded-md ring-1 ring-sea-600',
        'bg-[radial-gradient(circle_at_50%_40%,#7d1f1f,#2a0d0d_70%)]',
      ].join(' ')}
    >
      <div className="flex h-full items-center justify-center text-[10px] text-brass-600/70">☠</div>
    </div>
  );
}
