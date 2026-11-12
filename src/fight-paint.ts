/** Paint only when the canvas is visible, including a return to desktop while paused. */
export function fightPaint(phoneLayout: MediaQueryList, draw: () => void) {
  const paint = () => { if (!phoneLayout.matches) draw(); };
  phoneLayout.addEventListener('change', paint);
  return { paint, cleanup: () => phoneLayout.removeEventListener('change', paint) };
}
