/** Positions are in the 900px canvas coordinate space, with two columns per side. */
export function desktopRows(list: { creature: { puppet?: unknown } }[], side: 'crew' | 'enemy') {
  const left = side === 'crew' ? 20 : 515;
  let y = 10, column = 0;
  return list.map(({ creature }) => {
    if (creature.puppet) {
      if (column) { y += 164 + 98; column = 0; }
      const row = { x: left + 4, y, size: 370, bottom: y + 370 + 88 };
      y = row.bottom + 10;
      return row;
    }
    const row = { x: left + column * 205, y, size: 164, bottom: y + 164 + 88 };
    if (++column === 2) { y = row.bottom + 10; column = 0; }
    return row;
  });
}

export function desktopHit(rows: ReturnType<typeof desktopRows>, x: number, y: number): number {
  return rows.findIndex(r => x >= r.x && x < r.x + r.size && y >= r.y && y < r.bottom);
}

/** Keep pointer coordinates and keyboard navigation tied to the current enemy list. */
export function bindDesktopInspection(canvas: HTMLCanvasElement, enemies: () => { id: string; creature: { puppet?: unknown } }[], inspect: (id: string) => void) {
  let selected = '';
  const select = (id: string) => { selected = id; inspect(id); };
  canvas.addEventListener('click', ev => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const list = enemies();
    const index = desktopHit(desktopRows(list, 'enemy'), (ev.clientX - rect.left) * canvas.width / rect.width, (ev.clientY - rect.top) * canvas.height / rect.height);
    if (index >= 0) select(list[index].id);
  });
  canvas.addEventListener('keydown', ev => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(ev.key)) return;
    const list = enemies();
    if (!list.length) return;
    ev.preventDefault();
    const current = list.findIndex(f => f.id === selected);
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1;
    select(list[current < 0 ? (step > 0 ? 0 : list.length - 1) : (current + step + list.length) % list.length].id);
  });
}
