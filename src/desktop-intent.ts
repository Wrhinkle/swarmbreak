/** Show the currently applicable enemy routine; it can change before the turn. */
export function drawDesktopIntent(ctx: CanvasRenderingContext2D, intent: string, x: number, spriteBottom: number, width: number) {
  if (!intent) return;
  ctx.fillStyle = '#f3e6ca';
  ctx.font = '14px sans-serif';
  const maxWidth = width - 8;
  let line = '';
  let y = spriteBottom + 98;
  for (const word of `Now: ${intent}`.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x + 4, y, maxWidth);
      line = word;
      y += 16;
    } else line = next;
  }
  ctx.fillText(line, x + 4, y, maxWidth);
}
