/** Labels shared by the map and its readable room list. */
export function roomType(kind: string, hidden: boolean): string {
  return hidden ? 'Mystery' : kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Keep fight health readable independently of canvas scaling. */
export function fighterHealth(name: string, hp: number, maxHp: number, shield: number): string {
  return `${name}: ${Math.ceil(hp)} / ${maxHp} HP${shield ? ` · ${Math.ceil(shield)} shield` : ''}`;
}
