// Pick the same run as the game at the real time, then inspect it while it is open.
export function screenTime(manifest, now) {
  const nextOpen = Date.parse(manifest.next?.opensAt);
  const next = Number.isFinite(nextOpen) && nextOpen <= now;
  const live = next ? manifest.next : manifest;
  const opens = Date.parse(live.opensAt);
  const closes = next ? opens + 86_400_000 : Date.parse(manifest.next?.opensAt ?? manifest.nextOpensAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes - opens < 120_000) {
    throw new Error('run has no usable opening interval for the screen check');
  }
  return { live, time: opens + Math.min(3_600_000, Math.floor((closes - opens) / 2)) };
}
