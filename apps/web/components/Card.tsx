'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createPortal } from 'react-dom';
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
  /** Stagger the enter animation (ms) — used to "deal" hand cards one by one. */
  enterDelay?: number;
  /** Board cards pop into their zone instead of sliding in. */
  pop?: boolean;
  /** Combat effect: the attacker lunges, the target takes a damage pop. */
  fx?: 'lunge' | 'hit';
}

/**
 * Full-art preview, portaled to <body> as position:fixed so it escapes both the
 * FitScale transform (which would shrink it with the board) and every z-index
 * stacking context on the mat. Sized near the art's native 600×838 resolution
 * so card text is readable. Positioned beside the hovered card, clamped to the
 * viewport, flipping to the left edge when there's no room on the right.
 */
function HoverPreview({ anchor, src }: { anchor: DOMRect; src: string }) {
  const h = Math.min(600, window.innerHeight - 16);
  const w = Math.round(h * (600 / 838));
  let left = anchor.right + 12;
  if (left + w > window.innerWidth - 8) left = anchor.left - w - 12;
  left = Math.max(8, left);
  const top = Math.min(Math.max(anchor.top, 8), window.innerHeight - h - 8);
  return (
    <span
      className="pointer-events-none fixed z-[70] block overflow-hidden rounded-xl shadow-2xl ring-2 ring-brass-600/70"
      style={{ left, top, width: w, height: h }}
    >
      <Image src={src} alt="" fill sizes="440px" quality={95} className="object-cover" />
    </span>
  );
}

/** A card: art when it loads, a text face as fallback. Rested cards rotate. */
export function Card({ card, selected, dimmed, highlight, onClick, small, fluid, enterDelay, pop, fx }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const [previewAt, setPreviewAt] = useState<DOMRect | null>(null);
  const width = fluid ? 'w-full' : small ? 'w-12 sm:w-16' : 'w-16 sm:w-20 md:w-24';
  const enterAnim =
    fx === 'lunge' ? 'animate-lunge' : fx === 'hit' ? 'animate-damage-pop' : pop ? 'animate-pop-in' : 'animate-card-enter';
  return (
    <span
      className={`group relative inline-block ${width} ${enterAnim} ${fx === 'lunge' ? 'z-20' : ''} ${
        card.state === 'rested' && !fluid ? 'mx-2 sm:mx-3' : ''
      }`}
      style={enterDelay ? { animationDelay: `${enterDelay}ms`, animationFillMode: 'backwards' } : undefined}
      onMouseEnter={(e) => {
        // Hover preview is pointer-only — touch devices never fire a real hover.
        if (window.matchMedia('(hover: hover)').matches) {
          setPreviewAt(e.currentTarget.getBoundingClientRect());
        }
      }}
      onMouseLeave={() => setPreviewAt(null)}
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
          <div className="flex h-full w-full flex-col justify-between bg-sea-800 p-1 text-[0.5625rem] leading-tight">
            <div className="font-bold">{card.name}</div>
            <div>
              {card.cost !== null && <span>C{card.cost} </span>}
              {card.power !== null && <span>{card.power}</span>}
            </div>
          </div>
        )}
        {card.attachedDon > 0 && (
          <span
            key={card.attachedDon}
            className="absolute left-0.5 top-0.5 flex animate-pop-in items-center gap-0.5 rounded-full bg-black/80 px-1 py-px text-[0.625rem] font-bold text-brass-300"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-brass-400 shadow-[0_0_4px_rgba(227,187,95,0.8)]" />
            +{card.attachedDon}
          </span>
        )}
        {card.power !== null && !artFailed && (
          <span
            className={`absolute bottom-0.5 left-0.5 rounded-full bg-black/85 px-1.5 py-px text-[0.625rem] font-bold tabular-nums transition-colors duration-300 ${
              card.attachedDon > 0 ? 'text-bounty-400' : 'text-brass-300'
            }`}
          >
            {card.power}
          </span>
        )}
        {card.summoningSick && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-sea-700/90 px-1 text-[0.5625rem]">zzz</span>
        )}
        {card.state === 'rested' && (
          <span className="absolute right-0.5 top-0.5 -rotate-90 rounded bg-black/80 px-1 text-[0.5625rem] text-slate-300">
            R
          </span>
        )}
      </button>
      {/* Full-size art preview on hover, portaled above everything. */}
      {!artFailed &&
        previewAt &&
        createPortal(<HoverPreview anchor={previewAt} src={artUrl(card.definitionId)} />, document.body)}
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
      <div className="flex h-full items-center justify-center text-[0.625rem] text-brass-600/70">☠</div>
    </div>
  );
}
