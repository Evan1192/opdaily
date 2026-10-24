# OPDaily Visual Overhaul

## Research notes

Looked at the current production site plus three OPTCG web apps:

- **Limitless TCG** — crimson accent on near-white, card art used as identity everywhere, dense but clean data tables.
- **One Piece Online TCG** — full parchment/wanted-poster/nautical theme: compass roses, "WANTED" texture, gold-on-brown buttons. Very flavorful, but a light theme would fight our card-art-forward board.
- **OPCGSim (sandbox board)** — the strongest board reference: a real playmat layout with outlined zone slots (LEADER / STAGE / DECK / TRASH labels inside dashed slots), life as a sideways stack on the board edge, DON!! area, opponent side mirrored. Dark navy with gold compass accents.

Current OPDaily is functional but flat: generic slate panels, cards floating in rows with no zone structure, text-only chrome, no win-moment payoff.

## Direction — "Ship's log at midnight"

Dark deep-sea navy base (keeps card art pop), **gold/brass** for chrome and DON!!, **crimson** as the action/danger accent, and a nautical display font for headers. Playmat-style board with labeled zones like the real game. Make the daily/win moment feel like claiming a bounty. No heavy image assets — texture via CSS gradients only, keep the bundle thin.

## Changes (all in `apps/web`, no API changes)

### 1. Design foundation
- `tailwind.config.ts`: theme extension — palette (`sea-950/900/800` navy steps, `brass` gold ramp, `bounty` crimson ramp), box-shadow glows, keyframe animations (pulse-glow, card-enter, attack-shake).
- Fonts via `next/font/google`: **Pirata One** (display — wordmark, headers, "LETHAL" moments) + **Inter** (body/UI). Self-hosted by Next, no layout shift.
- `globals.css`: subtle radial-gradient vignette + faint compass-rose background (pure CSS/SVG inline), scrollbar styling.

### 2. Header → top bar with identity
- `OPDaily` wordmark in Pirata One with a skull-and-crossbones glyph.
- Puzzle info as a "bounty chip": `#N · date · title`, difficulty badge color-coded (easy emerald / medium amber / hard crimson).
- Right side: big Actions counter `N / par N` with gold emphasis, monospace timer underneath.

### 3. Board → playmat with zones (`Board.tsx`, biggest change)
- Each side rendered as a mat panel with labeled zone slots like OPCGSim: dashed-outline empty slots labeled LEADER / STAGE / 5 character slots, so the board reads as a game table even when sparse.
- Life as a vertical stack on the **left edge** of each mat (rotated card backs, count badge) — matches the physical game.
- DON!! area: gold coin tokens (active = bright brass, rested = dim), DON deck count as a stack.
- Deck + trash as card-back piles with count badges on the right edge (trash shows top card art when non-empty).
- Opponent mat mirrored above, slim center divider; combat banner slots into the divider as a crimson "⚔ 6000 vs 5000" strip with attack-shake animation on declare.
- Known opponent hand rendered face-up above their mat; otherwise a fanned card-back count.

### 4. Card affordances (`Card.tsx`)
- Hover: scale-up + full-size art preview floating to the side (desktop only).
- Targetable: soft emerald pulse-glow; selected: brass ring + slight lift; rested keeps 90° rotation but with a smooth transition.
- Attached DON shown as small gold coin badges stacked on the card corner.
- Power badge restyled: dark pill, gold text, red text when modified upward.

### 5. Action panel → command bar (`ActionPanel.tsx`)
- Sticky bottom command bar instead of a floating panel: contextual action buttons with kind icons (⚔ attack, ◉ DON, ✦ ability, ▸ play), End turn pushed right and styled as the "dangerous" crimson option.
- Pending decisions become a centered modal overlay with a dimmed backdrop — decisions are the one moment that should interrupt.

### 6. Win/lose payoff (`page.tsx`)
- Win: full-screen overlay styled as a bounty-claimed poster — "LETHAL." in Pirata One, actions vs par (crown mark when at par), teaches text in a brass-bordered panel, copy-share button, name entry, leaderboard inline.
- Loss/out-of-actions: same overlay in muted slate — "The line slipped away." with Reset prominent.
- Share string unchanged.

### 7. Leaderboard restyle (`Leaderboard.tsx`)
- "BOUNTY BOARD" header in display font, rank 1 row gold-tinted, par clears keep the ★ marker, brass table rules.

### 8. Polish
- Card-enter animation when the board loads; error toasts instead of a bare red line.
- Responsive: mats scale down cleanly at mobile widths (cards `w-16`, command bar wraps).
- `app/layout.tsx`: favicon (skull glyph), OG title/description for link sharing.

## Non-goals
- No gameplay/flow changes, no API changes, no new routes.
- No heavy image/texture assets — CSS only; keep first-load JS near the current ~98 kB.
- No framework additions (no framer-motion; CSS keyframes suffice).

## Verification
1. `npx next build` clean; first-load JS not meaningfully above ~110 kB.
2. Bundle leak-check (`findstr` for engine/solver symbols in `.next/static/chunks`) still empty.
3. Local dev against prod API: screenshot desktop (1280px) and mobile (~390px) via browser tool; click-throughs can't be automated here, so HTTP-drive a session and screenshot each visual state (idle, selected, pending decision, win overlay).
4. Deploy `vercel --prod`, screenshot production, confirm art still renders through the image optimizer.
5. Commit + push.

## Risks
- Pirata One is decorative — used only for display text, Inter everywhere readable.
- Playmat zone layout is a bigger DOM change in `Board.tsx`; the click-wiring (`selected`/`targets`/`actionable` sets) stays identical, only presentation moves.
- Fixed 5-slot character rows need care at mobile widths (slots shrink rather than wrap).
