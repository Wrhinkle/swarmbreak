import type { Today } from './save';
import type { CombatState } from './combat';
import type { MapNode } from './types';

// Combat owns current health until the fight is committed back to the save.
export function hudHealth(today: Today, combat: CombatState | null, inFight: boolean): number[] {
  const fighters = inFight ? combat?.fighters.filter(f => f.side === 'crew' && !f.summonedBy) : undefined;
  return today.crew.filter(c => c.active).map((c, i) => fighters?.[i]?.hp ?? c.hp);
}
export function hudLocation(today: Today, current: MapNode | undefined): string {
  return `Act ${(today.act ?? 0) + 1} · ${current ? `Room ${current.floor + 1}` : 'Start'} · ${today.gold} gold`;
}
