// Keep supported tutorial and fight interfaces paired: a partial or unknown interface must fail the host check.
export async function walkthrough({ heading, press }) {
  for (const title of ['The daily run', 'Choose your route', 'Your crew', 'In a fight']) {
    const shown = await heading();
    if (shown !== title) throw new Error(`expected walkthrough step "${title}", got "${shown}"`);
    await press('^Next$');
  }
  const shown = await heading();
  if (!['Give an order', 'Choose an action'].includes(shown)) throw new Error(`unknown walkthrough fight step "${shown}"`);
  await press('^Next$');
  const last = await heading();
  if (last !== 'Bring an ally home') throw new Error(`expected walkthrough step "Bring an ally home", got "${last}"`);
  await press('^Finish$');
}

export async function inspectFight({ press, waitButton, controls, shot, wait }) {
  await press('^Pause$');
  await press('^Resume$');
  const initial = await controls();
  // The tutorial title is not a mode marker: the ATB merge retained "Give an order".
  const mode = initial.autoBattle && !(initial.crew || initial.routine || initial.queue) ? 'atb'
    : !initial.autoBattle && (initial.crew || initial.routine || initial.queue) ? 'orders' : null;
  if (!mode) throw new Error(`unknown or ambiguous fight interface: ${JSON.stringify(initial)}`);
  if (mode === 'atb') {
    await press('^4×$');
    // Auto appears only when a crew member is ready; this proves the decision screen was reached.
    await waitButton('^Auto$');
    await press('^Pause$');
  } else if (mode === 'orders') {
    await wait(600);
    await press('^Pause$');
  } else throw new Error(`unknown fight interface "${mode}"`);
  const fight = await controls();
  const required = mode === 'orders' ? ['canvas', 'crew', 'routine', 'queue'] : ['canvas', 'autoBattle', 'decision', 'manual'];
  if (!required.every(key => fight[key])) throw new Error(`first ${mode} fight controls missing: ${JSON.stringify(fight)}`);
  await shot('fresh-fight');
  if (mode === 'atb') { await press('^Resume$'); await press('^Auto$'); }
}

// A successful driver must account for every screen at both viewport sizes.
export function checkScreens(shots) {
  for (const width of [390, 1280]) for (const screen of ['map', 'fresh-fight', 'fight', 'shop', 'treasure', 'event', 'rest', 'crew', 'title']) {
    if (!shots.some(s => s.width === width && s.screen === screen)) throw new Error(`missing ${screen} screen at ${width}px`);
  }
}
