import type { MapNode } from './types';

/** Legal pins travel; other pins only reveal their already-visible map details. */
export function mapPinAction(node: MapNode, legal: string[], choose: (node: MapNode) => void, inspect: (node: MapNode) => void) {
  if (legal.includes(node.id)) choose(node); else inspect(node);
}

/** A saved destination must be entered before another map action can run. */
export function lockTravelControls(root: Pick<HTMLElement, 'querySelectorAll'>) {
  root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
}

/** Stable presentation coordinates; never consume the run's random seed. */
export function mapPositions(nodes: MapNode[]): Map<string, {x: number; y: number}> {
  const top=Math.max(1,...nodes.map(n=>n.floor)), wide=Math.max(1,...nodes.map(n=>n.x));
  const wobble=(id:string,by:number)=>{let h=by;for(const ch of id)h=(h*31+ch.charCodeAt(0))>>>0;return h%1000/500-1;};
  return new Map(nodes.map(n=>[n.id,n.floor===top?{x:50,y:6}:{x:14+72*n.x/wide+7*wobble(n.id,7),y:94-82*n.floor/top+0.4*wobble(n.id,13)}]));
}

export const mapIconPaths: Record<string,string> = {
  fight:'M5 4l14 14M19 4L5 18M4 15l5 5M15 20l5-5', elite:'M12 2l9 10-9 10L3 12z',
  rest:'M4 8h13v5a6 6 0 01-6 6h-1a6 6 0 01-6-6z M17 9h2a3 3 0 010 6h-2 M7 3v3 M12 3v3',
  event:'M9 8a3 3 0 116 0c0 2-3 2-3 5 M12 17v1', shop:'M4 9h16v11H4z M3 9l2-5h14l2 5 M9 20v-6h6v6',
  treasure:'M3 10h18v10H3z M3 10l3-5h12l3 5 M12 10v10', boss:'M12 2l8 5v10l-8 5-8-5V7z M8 10h.1 M16 10h.1 M8 15h8',
  mystery:'M9 8a3 3 0 116 0c0 2-3 2-3 5 M12 17v1'
};

/** Keep immediate travel choices ahead of optional map details. */
export function appendMapSections(root: HTMLElement, routes: HTMLElement, story: HTMLElement | null, sheet: HTMLElement, navigation?: HTMLElement) {
  root.append(routes);
  if (navigation) root.append(navigation);
  if (story) root.append(story);
  root.append(sheet);
}
