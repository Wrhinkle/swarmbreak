import { describe, expect, it } from 'vitest';
import { countdownLineText } from './countdown';

describe('countdownLineText', () => {
  const now = Date.parse('2026-11-05T13:00:00Z');
  it('reports a late run after its opening time for either prefix', () => {
    for (const prefix of ['Next run in', 'Next run opens in']) {
      expect(countdownLineText(prefix, '2026-11-05T12:59:59Z', now)).toBe('The next run is late. Check back soon.');
    }
  });
  it('preserves the countdown format before and at the opening time', () => {
    expect(countdownLineText('Next run opens in', '2026-11-05T16:12:09Z', now)).toBe('Next run opens in 03:12:09');
    expect(countdownLineText('Next run in', '2026-11-06T15:00:00Z', now)).toBe('Next run in 1d 02:00:00');
    expect(countdownLineText('Next run in', '2026-11-05T13:00:00Z', now)).toBe('Next run in 00:00:00');
  });
  it('reports an invalid opening time', () => {
    expect(countdownLineText('Next run in', 'invalid', now)).toBe('Next run in opening time unavailable');
  });
});

describe('readable game labels', () => {
  it('formats room types and fighter health', async () => {
    const oldDocument = globalThis.document;
    const oldFetch = globalThis.fetch;
    globalThis.document = { querySelector: () => null } as unknown as Document;
    globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
    try {
      const { roomType, fighterHealth } = await import('./main');
      expect(roomType('elite', false)).toBe('Elite');
      expect(roomType('elite', true)).toBe('Mystery');
      expect(fighterHealth('Ally', 12.2, 30, 3.1)).toBe('Ally: 13 / 30 HP · 4 shield');
      expect(fighterHealth('Foe', 0, 20, 0)).toBe('Foe: 0 / 20 HP');
    } finally {
      globalThis.document = oldDocument;
      globalThis.fetch = oldFetch;
    }
  });
});

it('refreshes the roster for health, shields, and new fighters', async () => {
  class Element {
    textContent = '';
    className = '';
    children: Element[] = [];
    setAttribute() {}
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
  }
  const oldDocument = globalThis.document;
  const oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderRoster } = await import('./main');
    const roster = new Element();
    const fighters = [{ side: 'crew', creature: { name: 'Ally' }, hp: 10, maxHp: 20, shield: 0 }] as unknown as import('./combat').CombatState['fighters'];
    renderRoster(roster as unknown as HTMLElement, fighters);
    expect(roster.children[0].children[1].textContent).toBe('Ally: 10 / 20 HP');
    fighters[0].hp = 5; fighters[0].shield = 3;
    fighters.push({ ...fighters[0], side: 'enemy', creature: { ...fighters[0].creature, name: 'Foe' } });
    renderRoster(roster as unknown as HTMLElement, fighters);
    expect(roster.children[0].children[1].textContent).toBe('Ally: 5 / 20 HP · 3 shield');
    expect(roster.children[1].children[1].textContent).toBe('Foe: 5 / 20 HP · 3 shield');
  } finally {
    globalThis.document = oldDocument;
    globalThis.fetch = oldFetch;
  }
});

it('shows action readiness for each living fighter and refreshes it with time', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; attributes: Record<string, string> = {}; value = 0; max = 0;
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    append(...children: Element[]) { this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.children = children; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderRoster } = await import('./main');
    const roster = new Element();
    const fighters = [{ side: 'crew', creature: { name: 'Ally' }, hp: 10, maxHp: 20, shield: 0, speed: 10, nextAction: 10 }] as unknown as import('./combat').CombatState['fighters'];
    renderRoster(roster as unknown as HTMLElement, fighters, 5);
    expect(roster.children[0].children[2].value).toBe(5);
    expect(roster.children[0].children[2].max).toBe(10);
    expect(roster.children[0].children[2].attributes['aria-label']).toBe('Ally action readiness');
    renderRoster(roster as unknown as HTMLElement, fighters, 10);
    expect(roster.children[0].children[2].value).toBe(10);
    fighters[0].hp = 0;
    renderRoster(roster as unknown as HTMLElement, fighters, 10);
    expect(roster.children[0].children).toHaveLength(2);
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});


it('renders cards and selectable options with their supplied content', async () => {
  class Element {
    textContent = ''; className = ''; children: Element[] = []; attributes: Record<string, string> = {};
    type = ''; disabled = false; src = ''; alt = ''; click?: () => void;
    append(...children: Element[]) { this.children.push(...children); }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(_name: string, handler: () => void) { this.click = handler; }
  }
  const oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.document = { querySelector: () => null, createElement: () => new Element() } as unknown as Document;
  globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;
  try {
    const { renderCard, optionButtons } = await import('./main');
    const card = renderCard({ name: 'Guard', cost: '20g', effect: 'Protect an ally', icon: '◆' }) as unknown as Element;
    expect(card.children[0].textContent).toBe('◆');
    expect(card.children[1].children.map(c => c.textContent)).toEqual(['Guard', '20g', 'Protect an ally']);
    const ally = renderCard({ name: 'Ally', effect: 'Strike', art: '/ally.png' }) as unknown as Element;
    expect(ally.children[0].src).toBe('/ally.png');
    expect(ally.children[1].children.map(c => c.textContent)).toEqual(['Ally', 'Strike']);
    let selected = '';
    const group = optionButtons('Crew', [{value:'a',label:'Ally'}, {value:'b',label:'Friend'}], 'a', value => { selected = value; }) as unknown as Element;
    expect(group.children[1].attributes['aria-pressed']).toBe('true');
    group.children[2].click?.();
    expect(selected).toBe('b');
  } finally { globalThis.document = oldDocument; globalThis.fetch = oldFetch; }
});
