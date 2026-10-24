// Mirrors of the API's JSON payloads. The server builds these from the engine's
// redacted GameView; the client renders them and never computes rules itself.

export interface CardView {
  instanceId: string;
  definitionId: string;
  name: string;
  cardType: 'Leader' | 'Character' | 'Event' | 'Stage';
  colors: string[];
  subtypes: string[];
  attribute: string | null;
  text: string;
  triggerText: string;
  state: 'active' | 'rested';
  power: number | null;
  cost: number | null;
  counter: number | null;
  keywords: string[];
  attachedDon: number;
  summoningSick: boolean;
}

export interface PlayerView {
  id: number;
  leader: CardView;
  characters: CardView[];
  stage: CardView | null;
  hand: CardView[] | null;
  handCount: number;
  trash: CardView[];
  deckCount: number;
  life: (CardView | null)[];
  don: { donId: string; state: 'active' | 'rested'; attachedTo: string | null }[];
  donDeckCount: number;
  availableDon: number;
}

export interface CombatView {
  attacker: string;
  target: string;
  attackingPlayer: number;
  defendingPlayer: number;
  step: string;
  blocked: boolean;
  attackerPower: number;
  targetPower: number;
}

export interface GameView {
  viewer: number;
  turn: number;
  activePlayer: number;
  phase: string;
  you: PlayerView;
  opponent: PlayerView;
  combat: CombatView | null;
  result: { kind: 'win'; winner: number; reason: string } | { kind: 'draw'; reason: string } | null;
}

export interface PuzzleInfo {
  id: string;
  date: string;
  title: string;
  flavor: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  maxActions: number;
  par: number;
}

export interface PendingInfo {
  type: string;
  prompt: string | null;
  request: Record<string, unknown>;
  optionCount: number;
  options: Record<string, unknown>[];
}

export interface SessionState {
  view: GameView;
  actions: { key: string; kind: string }[];
  pending: PendingInfo | null;
  actionsSpent: number;
  maxActions: number;
  par: number;
  won: boolean;
  failed: boolean;
  solved: boolean;
  teaches: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  actions: number;
  elapsedMs: number;
}

export const artUrl = (definitionId: string): string =>
  `https://en.onepiece-cardgame.com/images/cardlist/card/${definitionId}.png`;
