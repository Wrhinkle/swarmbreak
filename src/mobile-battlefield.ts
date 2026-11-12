import type { CombatState } from './combat';

/** A readable, independently scrolling battlefield for narrow screens. */
export function mobileBattlefield(inspect: (id: string) => void) {
  const element = document.createElement('section');
  element.className = 'mobile-battlefield';
  element.setAttribute('aria-label', 'Battlefield');
  const columns = [document.createElement('div'), document.createElement('div')];
  element.append(...columns);
  const cards = new Map<string, { card: HTMLElement; health: HTMLElement }>();
  return {
    element,
    update(fighters: CombatState['fighters']) {
      for (const [index, side] of (['crew', 'enemy'] as const).entries()) {
        const children = fighters.filter(f => f.side === side).map(f => {
          let entry = cards.get(f.id);
          if (!entry) {
            const card = document.createElement(side === 'enemy' ? 'button' : 'div');
            card.className = 'battlefighter';
            if (side === 'enemy') (card as HTMLButtonElement).type = 'button';
            const art = document.createElement('span'); art.className = f.creature.puppet ? 'battlefighter-art puppet' : 'battlefighter-art';
            art.style.backgroundImage = `url("${f.creature.sprite}")`;
            const name = document.createElement('span'); name.className = 'battlefighter-name'; name.textContent = f.creature.name;
            const health = document.createElement('span'); health.className = 'battlefighter-health';
            card.append(art, name, health);
            if (side === 'enemy') card.addEventListener('click', () => inspect(f.id));
            entry = { card, health }; cards.set(f.id, entry);
          }
          entry.health.textContent = `${Math.ceil(f.hp)} / ${f.maxHp} HP${f.shield ? ` · ${Math.ceil(f.shield)} shield` : ''}`;
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
