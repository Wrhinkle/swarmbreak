// Runs in the page through Runtime.evaluate; keep it independent of host-side state.
export function fightControls(key) {
  const buttons = [...document.querySelectorAll('button')];
  const visible = b => b.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !b.matches(':disabled');
  const auto = buttons.find(b => /^Auto battle: (on|off)$/.test(b.textContent.trim()) && visible(b));
  const panel = document.querySelector('section[aria-label="Combat action"]');
  const choices = [...(panel?.querySelectorAll('button') ?? [])].filter(visible);
  const combat = JSON.parse(localStorage.getItem(key))?.today?.combat;
  const actor = combat?.fighters?.find(f => f.id === combat.atb?.pending);
  return {
    canvas: !!document.querySelector('canvas[aria-label^="Fight:"]'),
    crew: !![...document.querySelectorAll('legend')].find(e => e.textContent === 'Order a crew member'),
    routine: !![...document.querySelectorAll('legend')].find(e => e.textContent === 'Manual routine'),
    queue: !!buttons.find(b => b.textContent === 'Queue order' && b.checkVisibility()),
    auto: auto?.textContent.trim() ?? '',
    pending: !!actor,
    // Auto plus one choice per routine the pending fighter carries, the same choices the old order form offered.
    choices: !!actor && choices.some(b => b.textContent.trim() === 'Auto') &&
      choices.filter(b => b.textContent.trim() && b.textContent.trim() !== 'Auto').length >= (actor.routines?.length || 1),
  };
}
