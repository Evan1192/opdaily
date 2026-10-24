import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardId, type CardDefinition, type CardId } from '@optcg/core';
import { allScripts } from '@optcg/cards';

/**
 * Card definitions from the vendored snapshot.
 *
 * `@optcg/data`'s own loader resolves its snapshot directory relative to the
 * engine repo layout, which does not exist inside node_modules — so the
 * snapshot JSON is vendored alongside the tarballs and read directly here.
 */
let cache: Map<CardId, CardDefinition> | null = null;

export const loadVendoredDefinitions = (): Map<CardId, CardDefinition> => {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/ or src/ -> package root -> packages/ -> repo root -> vendor/
  const path = resolve(join(here, '..', '..', '..', 'vendor', 'card-snapshot.json'));
  const snapshot = JSON.parse(readFileSync(path, 'utf-8')) as {
    cards: (Omit<CardDefinition, 'id'> & { id: string })[];
  };
  cache = new Map(snapshot.cards.map((card) => [cardId(card.id), { ...card, id: cardId(card.id) }]));
  return cache;
};

export const loadScripts = allScripts;
