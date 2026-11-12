import { expect, it, vi } from 'vitest';
import { mobileBattlefield } from './mobile-battlefield';
import type { CombatState } from './combat';

it('shows both sides and updates health while preserving the enemy inspect control', () => {
  class Element {
    children: Element[] = []; textContent = ''; className = ''; type = ''; style: Record<string, string> = {};
    listeners: Record<string, () => void> = {};
    get childElementCount() { return this.children.length; }
    setAttribute() {} append(...items: Element[]) { this.children.push(...items); }
    replaceChildren(...items: Element[]) { this.children = items; }
    addEventListener(event: string, fn: () => void) { this.listeners[event] = fn; }
  }
  vi.stubGlobal('document', { createElement: () => new Element() });
  try {
    const inspect = vi.fn();
    const field = mobileBattlefield(inspect);
    const fighters = [
      { id: 'c0', side: 'crew', creature: { name: 'Ally', sprite: '/ally.png' }, hp: 10, maxHp: 20, shield: 0 },
      { id: 'e0', side: 'enemy', creature: { name: 'Enemy', sprite: '/enemy.png' }, hp: 9, maxHp: 12, shield: 0 },
    ] as CombatState['fighters'];
    field.update(fighters);
    const root = field.element as unknown as Element;
    const ally = root.children[0].children[0], enemy = root.children[1].children[0];
    expect(ally.children[1].textContent).toBe('Ally');
    expect(enemy.children[2].textContent).toBe('9 / 12 HP');
    enemy.listeners.click(); expect(inspect).toHaveBeenCalledWith('e0');
    fighters[1].hp = 4; fighters[1].shield = 2; field.update(fighters);
    expect(root.children[1].children[0]).toBe(enemy);
    expect(enemy.children[2].textContent).toBe('4 / 12 HP · 2 shield');
  } finally { vi.unstubAllGlobals(); }
});
