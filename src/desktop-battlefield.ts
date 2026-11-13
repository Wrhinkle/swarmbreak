/** Positions are in the 900px canvas coordinate space. Each fighter owns a full row. */
export function desktopRows(list: { creature: { puppet?: unknown } }[], side: 'crew' | 'enemy') {
  let y = 10;
  return list.map(f => {
    const size = f.creature.puppet ? 370 : 164;
    const row = { x: side === 'crew' ? 70 : 900 - 70 - size, y, size, bottom: y + size + 88 };
    y = row.bottom + 10;
    return row;
  });
}
