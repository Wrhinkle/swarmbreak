import { OVERRIDE_COOLDOWN_TICKS, TICK_MS } from './library';

type Choice = { id: string; label: string };
type Fighter = { id: string; name: string; routines: Choice[] };
let nextStatusId = 0;

/** Buttons cycle through the available choices without replacing the focused control. */
export function orderSelectors(fighters: Fighter[], queue: (fighter: string, routine: string) => void, state: () => { cooldown: number; queued: { actorId: string } | null; result: string | null; fighters: { id: string; hp: number }[] }) {
  const group = document.createElement('div');
  group.className = 'order-controls';
  const crew = document.createElement('button');
  const routine = document.createElement('button');
  const button = document.createElement('button');
  crew.type = routine.type = button.type = 'button';
  button.textContent = 'Queue order';
  const status = document.createElement('p');
  status.className = 'order-status';
  status.id = `order-status-${++nextStatusId}`;
  status.setAttribute('role', 'status');
  button.setAttribute('aria-describedby', status.id);
  let fighterIndex = 0, routineIndex = 0;
  const update = () => {
    const fighter = fighters[fighterIndex];
    const choice = fighter?.routines[routineIndex];
    crew.textContent = fighter?.name ?? 'No crew';
    routine.textContent = choice?.label ?? 'No routine';
    crew.setAttribute('aria-label', `Order a crew member: ${crew.textContent}. Activate to choose the next crew member.`);
    routine.setAttribute('aria-label', `Manual routine: ${routine.textContent}. Activate to choose the next routine.`);
    crew.disabled = fighters.length < 2;
    routine.disabled = (fighter?.routines.length ?? 0) < 2;
    const current = state();
    const actor = current.fighters.find(f => f.id === fighter?.id);
    const queued = current.queued && current.fighters.some(f => f.id === current.queued!.actorId && f.hp > 0);
    const reason = current.result ? 'Fight ended.' : !choice ? 'No routine available.' : !actor || actor.hp <= 0 ? 'Crew member is down.' : queued ? 'Order queued; wait until it is used.' : current.cooldown > 0 ? 'Shared cooldown recharging.' : 'Order ready.';
    button.disabled = reason !== 'Order ready.';
    if (status.textContent !== reason) status.textContent = reason;
  };
  crew.addEventListener('click', () => {
    const previous = fighters[fighterIndex]?.routines[routineIndex]?.id;
    fighterIndex = (fighterIndex + 1) % fighters.length;
    routineIndex = Math.max(0, fighters[fighterIndex].routines.findIndex(item => item.id === previous));
    update();
  });
  routine.addEventListener('click', () => {
    routineIndex = (routineIndex + 1) % fighters[fighterIndex].routines.length;
    update();
  });
  button.addEventListener('click', () => queue(fighters[fighterIndex].id, fighters[fighterIndex].routines[routineIndex].id));
  update();
  const field = (label: string, control: HTMLButtonElement) => {
    const box = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = label;
    box.append(legend, control);
    return box;
  };
  const limitation = document.createElement('p');
  limitation.className = 'order-limitation';
  limitation.textContent = `One order at a time. Using it starts a shared cooldown of ${OVERRIDE_COOLDOWN_TICKS * TICK_MS / 1000} seconds at 1× speed.`;
  group.append(field('Order a crew member', crew), field('Manual routine', routine), button, limitation, status);
  return { element: group, update };
}
