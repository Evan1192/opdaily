// Anonymous identity: a UUID minted once and kept in localStorage. No auth —
// the leaderboard name is whatever the player chooses to attach to it.

const KEY = 'opdaily:player';
const NAME_KEY = 'opdaily:name';

export const playerId = (): string => {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
};

export const savedName = (): string | null => localStorage.getItem(NAME_KEY);

// Testing only: drop the anonymous id so the server treats us as a new player,
// granting a fresh attempt at today's puzzle. Remove before public launch.
export const resetIdentity = (): void => {
  localStorage.removeItem(KEY);
};

export const saveName = (name: string): void => {
  localStorage.setItem(NAME_KEY, name);
};

// First-visit tutorial: shown once, then remembered.
const TUTORIAL_KEY = 'opdaily:tutorial';

export const seenTutorial = (): boolean => localStorage.getItem(TUTORIAL_KEY) !== null;

export const markTutorialSeen = (): void => {
  localStorage.setItem(TUTORIAL_KEY, '1');
};

// Daily win streak, tracked locally. Recording the same date twice is a no-op,
// consecutive dates extend the streak, any gap resets it to 1.
const STREAK_KEY = 'opdaily:streak';

export const recordWin = (date: string): number => {
  let prev: { count: number; lastDate: string } | null = null;
  try {
    prev = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null');
  } catch {
    prev = null;
  }
  if (prev && prev.lastDate === date) return prev.count;
  const yesterday = new Date(`${date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isConsecutive = prev?.lastDate === yesterday.toISOString().slice(0, 10);
  const count = isConsecutive ? prev!.count + 1 : 1;
  localStorage.setItem(STREAK_KEY, JSON.stringify({ count, lastDate: date }));
  return count;
};
