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
}

/** A card: art when it loads, a text face as fallback. Rested cards rotate. */
export function Card({ card, selected, dimmed, highlight, onClick, small }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const width = small ? 'w-16' : 'w-24';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        width,
        'relative aspect-[600/838] rounded-md overflow-hidden text-left transition-transform',
        card.state === 'rested' ? 'rotate-90 mx-3' : '',
        selected ? 'ring-4 ring-amber-400' : highlight ? 'ring-2 ring-emerald-400' : 'ring-1 ring-slate-700',
        dimmed ? 'opacity-40' : '',
        onClick ? 'cursor-pointer hover:scale-105' : 'cursor-default',
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
        <div className="flex h-full w-full flex-col justify-between bg-slate-800 p-1 text-[9px] leading-tight">
          <div className="font-bold">{card.name}</div>
          <div>
            {card.cost !== null && <span>C{card.cost} </span>}
            {card.power !== null && <span>{card.power}</span>}
          </div>
        </div>
      )}
      {card.attachedDon > 0 && (
        <span className="absolute left-0.5 top-0.5 rounded bg-black/80 px-1 text-[10px] font-bold text-amber-300">
          +{card.attachedDon} DON
        </span>
      )}
      {card.power !== null && !artFailed && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/80 px-1 text-[10px] font-bold">
          {card.power}
        </span>
      )}
      {card.summoningSick && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-blue-900/90 px-1 text-[9px]">zzz</span>
      )}
      {card.state === 'rested' && (
        <span className="absolute right-0.5 top-0.5 rounded bg-black/80 px-1 text-[9px] -rotate-90">R</span>
      )}
    </button>
  );
}

/** A face-down card back (hidden life, opponent hand count). */
export function CardBack({ small }: { small?: boolean }) {
  return (
    <div
      className={`${small ? 'w-10' : 'w-16'} aspect-[600/838] rounded-md bg-gradient-to-br from-red-900 to-slate-900 ring-1 ring-slate-700`}
    />
  );
}
