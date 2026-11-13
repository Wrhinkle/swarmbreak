/** Positions are in the 900px canvas coordinate space, with two columns per side. */
export function desktopRows(list: { creature: { puppet?: unknown } }[], side: 'crew' | 'enemy') {
  const size = 164;
  return list.map((_, i) => {
    const x = (side === 'crew' ? 20 : 515) + (i % 2) * 205;
    const y = 10 + Math.floor(i / 2) * (size + 98);
    return { x, y, size, bottom: y + size + 88 };
  });
}

export function desktopHit(rows: ReturnType<typeof desktopRows>, x: number, y: number): number {
  return rows.findIndex(r => x >= r.x && x < r.x + r.size && y >= r.y && y < r.bottom);
}
