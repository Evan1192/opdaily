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

export const saveName = (name: string): void => {
  localStorage.setItem(NAME_KEY, name);
};
