// Emit packages/puzzle/src/cards.generated.json: UI metadata for exactly the
// cards the committed puzzles reference, keeping the client payload small
// instead of shipping all ~2800 printings.
//
// Art: the normalised snapshot carries no image URLs (the current source
// adapter leaves `images` empty), but every printing's art is addressable by
// its id at en.onepiece-cardgame.com/images/cardlist/card/<id>.png — the same
// path the engine repo's data notes read block icons from. Alt arts keep
// their `_p1`/`_p2` suffix in the id, so the pattern covers them too.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = JSON.parse(readFileSync(join(root, 'vendor', 'card-snapshot.json'), 'utf-8'));
const byId = new Map(snapshot.cards.map((card) => [card.id, card]));

const ART_BASE = 'https://en.onepiece-cardgame.com/images/cardlist/card';

// Collect every card id any puzzle mentions, wherever it appears in the file
// (leader, hand, characters, decks, lifeCards, deckTop, trash). Matching
// string values against the id pattern is deliberately schema-agnostic so this
// script never lags a puzzle-schema change.
const CARD_ID = /^(?:OP|EB|ST|PRB|P)[A-Z0-9]*-\d{3}(?:_p\d+)?$/;
const referenced = new Set();
const collect = (value) => {
  if (typeof value === 'string') {
    if (CARD_ID.test(value)) referenced.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collect(item);
  }
};

const puzzleDir = join(root, 'puzzles');
const puzzleFiles = existsSync(puzzleDir)
  ? readdirSync(puzzleDir).filter((f) => f.endsWith('.json') && !f.endsWith('.solution.json'))
  : [];
for (const file of puzzleFiles) {
  collect(JSON.parse(readFileSync(join(puzzleDir, file), 'utf-8')));
}

const missing = [...referenced].filter((id) => !byId.has(id));
if (missing.length > 0) {
  throw new Error(`Puzzles reference ids absent from the card snapshot: ${missing.join(', ')}`);
}

const cards = [...referenced].sort().map((id) => {
  const c = byId.get(id);
  return {
    id: c.id,
    name: c.name,
    cardType: c.cardType,
    colors: c.colors,
    cost: c.cost,
    power: c.power,
    counter: c.counter,
    life: c.life,
    attribute: c.attribute,
    subtypes: c.subtypes,
    text: c.text,
    triggerText: c.triggerText,
    keywords: c.keywords,
    set: c.set,
    art: `${ART_BASE}/${c.id}.png`,
  };
});

const out = join(root, 'packages', 'puzzle', 'src', 'cards.generated.json');
writeFileSync(out, `${JSON.stringify({ snapshot: snapshot.manifest.version, cards }, null, 2)}\n`);
console.log(`${cards.length} cards from ${puzzleFiles.length} puzzles -> ${out}`);
