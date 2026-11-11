type Choice = { id: string; label: string };
type Fighter = { id: string; name: string; routines: Choice[] };

/** Buttons cycle through the available choices without replacing the focused control. */
export function orderSelectors(fighters: Fighter[], queue: (fighter: string, routine: string) => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'order-controls';
  const crew = document.createElement('button');
  const routine = document.createElement('button');
  const button = document.createElement('button');
  crew.type = routine.type = button.type = 'button';
  button.textContent = 'Queue order';
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
    button.disabled = !choice;
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
  group.append(field('Order a crew member', crew), field('Manual routine', routine), button);
  return group;
}
