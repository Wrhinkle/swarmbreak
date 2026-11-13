import { expect, it, vi } from 'vitest';
import { mobileBattlefield } from './mobile-battlefield';
import type { CombatState } from './combat';

it('shows both sides and updates health while preserving the enemy inspect control', () => {
  class Element {
    children: Element[] = []; textContent = ''; className = ''; type = ''; style: Record<string, string> = {};
    listeners: Record<string, () => void> = {}; parent: Element | null = null;
    get nextSibling(): Element | null { if (!this.parent) return null; return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null; }
    focus() { doc.activeElement = this; }
    remove() { if (!this.parent) return; const siblings = this.parent.children; siblings.splice(siblings.indexOf(this), 1); this.parent = null; if (doc.activeElement === this) doc.activeElement = null; }
    insertBefore(item: Element, before: Element | null) { item.remove(); const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, item); item.parent = this; }
    get childElementCount() { return this.children.length; }
    setAttribute() {} append(...items: Element[]) { for (const item of items) this.insertBefore(item, null); }
    replaceChildren(...items: Element[]) { this.children = items; }
    addEventListener(event: string, fn: () => void) { this.listeners[event] = fn; }
  }
  const doc: { activeElement: Element | null; createElement: () => Element } = { activeElement: null, createElement: () => new Element() };
  vi.stubGlobal('document', doc);
  try {
    const inspect = vi.fn();
    const field = mobileBattlefield(inspect);
    const fighters = [
      { id: 'c0', side: 'crew', creature: { name: 'Ally', sprite: '/ally.png' }, hp: 10, maxHp: 20, shield: 0 },
      { id: 'e0', side: 'enemy', creature: { name: 'Enemy', sprite: '/enemy.png' }, hp: 9, maxHp: 12, shield: 0, speed: 8, nextAction: 8 },
    ] as CombatState['fighters'];
    field.update(fighters);
    const root = field.element as unknown as Element;
    const ally = root.children[0].children[0], enemy = root.children[1].children[0];
    for (const card of [ally, enemy]) expect(card.children.map(child => child.className)).toEqual([
      'battlefighter-art', 'battlefighter-feedback', 'battlefighter-atb', 'battlefighter-name', 'battlefighter-hp', 'battlefighter-health', 'battlefighter-health',
    ]);
    expect(ally.children[3].textContent).toBe('Ally');
    expect(enemy.children[5].textContent).toBe('9 / 12 HP');
    expect(enemy.children[6].textContent).toBe('Turn readiness: 0%');
    field.update(fighters, 4);
    expect(enemy.children[6].textContent).toBe('Turn readiness: 50%');
    expect((enemy.children[4] as unknown as HTMLProgressElement).value).toBe(9);
    expect((enemy.children[4] as unknown as HTMLProgressElement).max).toBe(12);
    expect((enemy.children[2] as unknown as HTMLProgressElement).value).toBe(50);
    field.update(fighters, 4, [{ t: 4, kind: 'action', actor: 'e0', target: 'e0', amount: 0, routine: 'strike' }, { t: 4, kind: 'damage', actor: 'e0', target: 'c0', amount: 1, routine: 'strike' }]);
    expect(enemy.children[6].textContent).toBe('Turn readiness: 50% · Acted: Strike → Ally');
    expect(ally.children[1].textContent).toBe('−1');
    field.update(fighters, 5, [{ t: 5, kind: 'heal', actor: 'c0', target: 'c0', amount: 3, routine: 'patch' }, { t: 5, kind: 'damage', actor: 'e0', target: 'c0', amount: 2, routine: 'strike' }]);
    expect(ally.children[1].textContent).toBe('−2  +3');
    field.update(fighters, 11, [{ t: 5, kind: 'heal', actor: 'c0', target: 'c0', amount: 3, routine: 'patch' }]);
    expect(ally.children[1].textContent).toBe('');
    fighters[1].routines = ['breach', 'strike'];
    const state = { fighters } as CombatState;
    field.update(fighters, 4, [], state);
    expect(enemy.children[6].textContent).toBe('Turn readiness: 50%');
    fighters[0].shield = 3; field.update(fighters, 4, [], state);
    expect(enemy.children[6].textContent).toBe('Turn readiness: 50%');
    state.queued = { actorId: 'c0', routineId: 'strike' };
    field.update(fighters, 4, [], state);
    expect(ally.children[6].textContent).toContain('Queued: Strike');
    fighters[1].charging = true;
    field.update(fighters, 4, [], state);
    expect(enemy.children[6].textContent).toContain('Charging: Charge (target undetermined)');
    enemy.listeners.click(); expect(inspect).toHaveBeenCalledWith('e0');
    fighters[1].hp = 4; fighters[1].shield = 2; field.update(fighters);
    expect(root.children[1].children[0]).toBe(enemy);
    expect(enemy.children[5].textContent).toBe('4 / 12 HP · 2 shield');
    enemy.focus();
    const summon = { ...fighters[1], id: 'e1', creature: { ...fighters[1].creature, name: 'Summon' } };
    field.update([...fighters, summon]);
    expect(doc.activeElement).toBe(enemy);
    field.update([fighters[0], summon, fighters[1]]);
    expect(doc.activeElement).toBe(enemy);
    expect(root.children[1].children[1]).toBe(enemy);
  } finally { vi.unstubAllGlobals(); }
});
