// Ad-hoc snapshot queries used while authoring puzzles. Not part of the build.
import { readFileSync } from 'node:fs';

const snap = JSON.parse(readFileSync(new URL('../vendor/card-snapshot.json', import.meta.url), 'utf8'));
const cards = snap.cards;

const mode = process.argv[2];
const arg = process.argv[3];

const brief = (c) =>
  `${c.id} ${c.name} [${c.cardType}] ${c.colors.join('/')} cost:${c.cost} pow:${c.power} ctr:${c.counter} kw:${c.keywords.join(',')}` +
  (c.text ? `\n    ${c.text.replaceAll('\n', ' / ')}` : '') +
  (c.triggerText ? `\n    TRIGGER: ${c.triggerText}` : '');

if (mode === 'id') {
  for (const c of cards.filter((c) => c.id.startsWith(arg))) console.log(brief(c));
} else if (mode === 'text') {
  const re = new RegExp(arg, 'i');
  for (const c of cards.filter((c) => re.test(c.text) || re.test(c.triggerText))) console.log(brief(c));
} else if (mode === 'leaders') {
  for (const c of cards.filter((c) => c.cardType === 'Leader' && (!arg || c.set === arg))) console.log(brief(c));
} else if (mode === 'kw') {
  for (const c of cards.filter((c) => c.keywords.includes(arg))) console.log(brief(c));
} else {
  console.log('usage: query-cards.mjs id <prefix> | text <regex> | leaders [set] | kw <keyword>');
}
