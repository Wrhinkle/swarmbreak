import type { Fighter } from './combat';

/** Timing only: the routine and target are chosen when the turn happens. */
export function readiness(f: Pick<Fighter, 'hp' | 'speed' | 'nextAction'>, tick: number): string {
  if (f.hp <= 0) return 'Down';
  if (!Number.isFinite(f.speed) || f.speed <= 0 || !Number.isFinite(f.nextAction)) return 'Turn timing unavailable';
  const progress = Math.max(0, Math.min(1, 1 - (f.nextAction - tick) / f.speed));
  return progress >= 1 ? 'Turn ready' : `Turn readiness: ${Math.round(progress * 100)}%`;
}
