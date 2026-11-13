import type { CombatState } from './combat';

type Feedback = { target: string; kind: 'damage' | 'heal'; amount: number; until: number };

/** Events remain in combat history for several ticks; collect only this tick's impacts. */
export function addFeedback(current: Feedback[], events: CombatState['events'], tick: number): Feedback[] {
  const active = current.filter(f => f.until > tick);
  for (const e of events) {
    if (e.t === tick && (e.kind === 'damage' || e.kind === 'heal') && e.amount > 0)
      active.push({ target: e.target, kind: e.kind, amount: e.amount, until: tick + 10 });
  }
  return active;
}

/** Draw on top of all fighters so neighboring sprites cannot obscure the result. */
export function drawFeedback(ctx: CanvasRenderingContext2D, feedback: Feedback[], target: string, x: number, y: number, tick: number) {
  const impacts = feedback.filter(f => f.target === target && f.until > tick);
  const damage = impacts.filter(f => f.kind === 'damage').reduce((n, f) => n + f.amount, 0);
  const healing = impacts.filter(f => f.kind === 'heal').reduce((n, f) => n + f.amount, 0);
  ctx.save();
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#17231f';
  let line = 0;
  for (const [text, color] of [[damage ? `−${damage}` : '', '#fff0b9'], [healing ? `+${healing}` : '', '#a8f4d0']]) {
    if (!text) continue;
    const baseline = y + 10 + line++ * 28;
    ctx.fillStyle = color; ctx.strokeText(text, x, baseline); ctx.fillText(text, x, baseline);
  }
  ctx.restore();
}
