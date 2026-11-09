// The contract between the run pipeline and the game. A run is plain JSON: no code, no invented numbers.
export type BodyPlan = 'humanoid' | 'beast' | 'flier' | 'swarm' | 'blob' | 'serpent' | 'object' | 'construct' | 'plant' | 'colossus';
export type Role = 'bruiser' | 'shielder' | 'summoner' | 'debuffer' | 'healer' | 'charger' | 'splitter' | 'thief' | 'mirror';
export type Tier = 'easy' | 'regular' | 'elite' | 'boss' | 'ally';
export type NodeKind = 'fight' | 'elite' | 'rest' | 'event' | 'shop' | 'treasure' | 'boss';

export interface Manifest {
  runId: string;
  opensAt: string; // ISO time this run opened
  nextOpensAt: string; // ISO time the next run is due
  runUrl: string; // for example /runs/2026-11-02/run.json
  voided: string[]; // runs where a confirmed bug gives losing players their attempt back
  next?: { runId: string; opensAt: string; runUrl: string }; // a prebuilt run that takes over at its opensAt, no deploy needed
}

// Identity comes from the site. Behavior comes from the library, by id.
export interface Creature {
  id: string;
  name: string;
  blurb: string; // one or two sentences, drawn from the site's content
  sprite: string; // path relative to the site root: a 6x4 sheet (idle, attack, hit, death; 6 frames each)
  bodyPlan: BodyPlan;
  role: Role;
  tier: Tier;
  routines: string[]; // ROUTINES ids, in priority order
  source: string; // path on the site this creature came from
  scale?: number; // enemy HP and power multiplier, set by the balance tool within ENEMY_SCALE limits
  puppet?: boolean; // sprite is one large image animated in code, used for bosses
}

export interface MapNode {
  id: string;
  floor: number; // 0 is the first floor, boss is last
  x: number; // column, for drawing the map
  kind: NodeKind;
  label: string; // a page title from the site
  sourcePath: string;
  next: string[]; // ids of nodes on the following floor
  easy: boolean; // one of an act's first 3 fights on any path
  encounter?: string[]; // creature ids for fight, elite, and boss
  eventId?: string;
  reward?: string; // ally id recruited by clearing this node
  hidden?: boolean; // a mystery room: the map shows ? until the player enters
}

export interface GameEvent {
  id: string;
  title: string;
  text: string; // written from the site's content
  art?: string; // path to this event's illustration
  options: { label: string; effect: EventEffect; result: string }[];
}

export type EventEffect =
  | { type: 'heal'; amount: number } // fraction of max HP, whole crew
  | { type: 'damage'; amount: number } // fraction of max HP, whole crew
  | { type: 'gold'; amount: number }
  | { type: 'routine'; id: string }
  | { type: 'nothing' };

export interface RunAct {
  site: { name: string; url: string; note: string }; // note holds license and "not affiliated" text
  theme: string; // the swarm's angle on this site
  nodes: MapNode[]; // every floor, ending in one boss node
  creatures: Creature[];
  events: GameEvent[];
  shop: string[]; // ROUTINES ids offered at shops in this act
  story?: ActStory;
  art?: { map: string; backdrops: string[] }; // tall map background; one fight backdrop per chapter
}

// Told by floor, not by room, so every path through the act gets the same story.
export interface ActStory {
  intro: string; // shown when the act opens
  chapters: { title: string; text: string }[]; // three: floors 1-5, 6-10, 11-15
  bossIntro: string;
  outro: string; // shown when the boss falls
}

export interface Run {
  id: string;
  title: string;
  swarm: { name: string; blurb: string };
  crew: Creature[]; // starting crew, tier 'ally'
  acts: RunAct[];
  seed: number;
}

// One site crawl, from tools/crawl. Holds structure and short excerpts only, so it can be committed.
export interface SitePage {
  path: string;
  title: string;
  section: string; // first path segment, or 'home'
  excerpt: string; // at most 200 characters
  headings: string[];
  links: string[]; // same-site paths
}
export interface SiteGraph { host: string; url: string; crawledAt: string; pages: SitePage[] }
