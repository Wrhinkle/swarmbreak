// The fixed library. Runs pick from it by id, and only people change what an existing id does.
import type { Role, Tier } from './types';

export type ConditionId = 'always' | 'self_hp_below' | 'ally_hp_below' | 'ally_down' | 'self_unshielded' | 'foe_shielded' | 'foe_hp_below' | 'foes_at_least' | 'self_corrupted';
export type ActionId = 'strike' | 'heavy' | 'sweep' | 'overflow' | 'patch' | 'mend_all' | 'guard_self' | 'guard_ally' | 'corrupt' | 'purge' | 'stun' | 'summon' | 'split' | 'steal' | 'mirror' | 'charge';

export interface Routine {
  id: string;
  name: string;
  condition: ConditionId;
  arg?: number; // threshold fraction for *_below, count for foes_at_least
  action: ActionId;
  upgradesTo?: string;
  price: number;
}

const r = (id: string, name: string, condition: ConditionId, action: ActionId, price: number, arg?: number, upgradesTo?: string): Routine =>
  ({ id, name, condition, action, price, arg, upgradesTo });

export const ROUTINES: Record<string, Routine> = Object.fromEntries([
  r('strike', 'Strike', 'always', 'strike', 20, undefined, 'strike+'),
  r('strike+', 'Clean Strike', 'always', 'heavy', 70),
  r('finish', 'Finish Them', 'foe_hp_below', 'heavy', 50, 0.3),
  r('breach', 'Breach', 'foe_shielded', 'overflow', 50),
  r('sweep', 'Sweep', 'foes_at_least', 'sweep', 60, 2, 'sweep+'),
  r('sweep+', 'Wide Sweep', 'foes_at_least', 'sweep', 90, 1),
  r('patch', 'Patch', 'ally_hp_below', 'patch', 45, 0.5, 'patch+'),
  r('patch+', 'Early Patch', 'ally_hp_below', 'patch', 80, 0.75),
  r('triage', 'Triage', 'ally_down', 'mend_all', 70),
  r('brace', 'Brace', 'self_unshielded', 'guard_self', 40),
  r('cover', 'Cover', 'ally_hp_below', 'guard_ally', 55, 0.5),
  r('last_stand', 'Last Stand', 'self_hp_below', 'guard_self', 35, 0.4),
  r('corrupt', 'Corrupt', 'always', 'corrupt', 50),
  r('purge', 'Purge', 'self_corrupted', 'purge', 40),
  r('jam', 'Jam', 'foes_at_least', 'stun', 65, 1),
  r('charge', 'Charge', 'always', 'charge', 60),
  // Swarm-only behavior. Price 0 means it's never sold.
  r('spawn', 'Spawn', 'foes_at_least', 'summon', 0, 1),
  r('divide', 'Divide', 'self_hp_below', 'split', 0, 0.5),
  r('skim', 'Skim', 'always', 'steal', 0),
  r('echo', 'Echo', 'always', 'mirror', 0),
].map(x => [x.id, x]));

// Starting stats per role and how much each tier scales them. The balance sim tunes these numbers.
export const ROLE_STATS: Record<Role, { hp: number; power: number; speed: number }> = {
  bruiser: { hp: 34, power: 7, speed: 8 },
  shielder: { hp: 30, power: 4, speed: 9 },
  summoner: { hp: 22, power: 3, speed: 11 },
  debuffer: { hp: 22, power: 4, speed: 8 },
  healer: { hp: 24, power: 4, speed: 9 },
  charger: { hp: 24, power: 6, speed: 6 },
  splitter: { hp: 30, power: 4, speed: 9 },
  thief: { hp: 20, power: 4, speed: 5 },
  mirror: { hp: 26, power: 4, speed: 8 },
};
export const TIER_SCALE: Record<Tier, { hp: number; power: number }> = {
  easy: { hp: 0.91, power: 0.91 },
  regular: { hp: 1.6, power: 1.6 },
  elite: { hp: 2.8, power: 1.96 },
  boss: { hp: 7.5, power: 2.4 },
  ally: { hp: 1.4, power: 1 },
};

export const SLOTS_START = 3;
export const SLOTS_MAX = 8;
export const CREW_MAX = 4;
export const OVERRIDE_COOLDOWN_TICKS = 20;
