export function countdownLineText(prefix: string, nextOpensAt: string, now: number): string {
  const ms = Date.parse(nextOpensAt) - now;
  if (!Number.isFinite(ms)) return `${prefix} opening time unavailable`;
  if (ms < 0) return 'The next run is late. Check back soon.';
  const seconds = Math.floor(ms / 1000), days = Math.floor(seconds / 86400);
  return `${prefix} ${days ? `${days}d ` : ''}${String(Math.floor(seconds / 3600) % 24).padStart(2,'0')}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}
