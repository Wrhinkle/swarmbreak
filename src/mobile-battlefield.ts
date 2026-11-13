import { fightActions } from './fight-actions';
import { enemyIntent } from './enemy-intent';
import type { CombatState } from './combat';
import { readiness, readinessProgress } from './readiness';

/** A readable, independently scrolling battlefield for narrow screens. */
export function mobileBattlefield(inspect: (id: string) => void) {
  const element = document.createElement('section');
  element.className = 'mobile-battlefield';
  element.setAttribute('aria-label', 'Battlefield');
  const columns = [document.createElement('div'), document.createElement('div')];
  element.append(...columns);
  const cards = new Map<string, { card: HTMLElement; feedback: HTMLElement; health: HTMLElement; timing: HTMLElement; hpBar: HTMLProgressElement; atbBar: HTMLProgressElement }>();
  return {
    element,
    update(fighters: CombatState['fighters'], tick = 0, events: CombatState['events'] = [], state?: CombatState) {
      const actions = fightActions(fighters, events);
      for (const [index, side] of (['crew', 'enemy'] as const).entries()) {
        const children = fighters.filter(f => f.side === side).map(f => {
          let entry = cards.get(f.id);
          if (!entry) {
            const card = document.createElement(side === 'enemy' ? 'button' : 'div');
            card.className = 'battlefighter';
            if (side === 'enemy') (card as HTMLButtonElement).type = 'button';
            const art = document.createElement('span'); art.className = f.creature.puppet ? 'battlefighter-art puppet' : 'battlefighter-art';
            art.style.backgroundImage = `url("${f.creature.sprite}")`;
            const feedback = document.createElement('span'); feedback.className = 'battlefighter-feedback';
            const name = document.createElement('span'); name.className = 'battlefighter-name'; name.textContent = f.creature.name;
            const health = document.createElement('span'); health.className = 'battlefighter-health';
            const timing = document.createElement('span'); timing.className = 'battlefighter-health';
            const hpBar = document.createElement('progress'); hpBar.className = 'battlefighter-hp';
            const atbBar = document.createElement('progress'); atbBar.className = 'battlefighter-atb'; atbBar.max = 100;
            card.append(art, feedback, atbBar, name, hpBar, health, timing);
            if (side === 'enemy') card.addEventListener('click', () => inspect(f.id));
            entry = { card, feedback, health, timing, hpBar, atbBar }; cards.set(f.id, entry);
          }
          const recent = events.filter(e => e.target === f.id && tick >= e.t && tick - e.t < 6 && e.amount > 0);
          const damage = recent.filter(e => e.kind === 'damage').reduce((sum, e) => sum + e.amount, 0);
          const healing = recent.filter(e => e.kind === 'heal').reduce((sum, e) => sum + e.amount, 0);
          entry.feedback.textContent = [damage ? `−${damage}` : '', healing ? `+${healing}` : ''].filter(Boolean).join('  ');
          entry.health.textContent = `${Math.ceil(f.hp)} / ${f.maxHp} HP${f.shield ? ` · ${Math.ceil(f.shield)} shield` : ''}`;
          entry.hpBar.max = f.maxHp; entry.hpBar.value = Math.max(0, f.hp);
          entry.hpBar.setAttribute('aria-label', `${f.creature.name} health`);
          entry.atbBar.value = (readinessProgress(f, tick) ?? 0) * 100;
          entry.atbBar.setAttribute('aria-label', `${f.creature.name}: ${readiness(f, tick)}`);
          entry.timing.textContent = `${readiness(f, tick)}${side === 'enemy' && state && f.hp > 0 ? ` · Intent now: ${enemyIntent(state, f)} (may change)` : ''}${actions.has(f.id) ? ` · ${actions.get(f.id)}` : ''}`;
          return entry.card;
        });
        const column = columns[index];
        for (const child of Array.from(column.children)) if (!children.includes(child as HTMLElement)) child.remove();
        for (let i = 0; i < children.length; i++) {
          while (column.children[i] !== children[i]) {
            const current = column.children[i];
            // Move surrounding cards instead of detaching the focused control.
            if (children[i] === document.activeElement && current) column.insertBefore(current, children[i].nextSibling);
            else column.insertBefore(children[i], current ?? null);
          }
        }
      }
    },
  };
}
