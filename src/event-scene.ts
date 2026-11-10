import type { EventEffect } from './types';

type EventScene = { title: string; text: string; art?: string; options: { label: string; effect: EventEffect; result: string }[] };

/** Build the scene without changing event effects or resolving a choice. */
export function renderEventScene(event: EventScene, gold: number, choose: (effect: EventEffect, result: string) => void): HTMLElement {
  const panel = document.createElement('section'); panel.className = 'event-scene';
  if (event.art) { const img = document.createElement('img'); img.src = event.art; img.alt = ''; img.className = 'event-art'; img.onerror = () => img.remove(); panel.append(img); }
  const story = document.createElement('div'); story.className = 'event-story';
  const title = document.createElement('div'); title.className = 'stage-subtitle'; title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '2'); title.textContent = event.title;
  const text = document.createElement('p'); text.textContent = event.text; story.append(title, text); panel.append(story);
  const options = document.createElement('div'); options.className = 'event-options';
  for (const option of event.options) { const button = document.createElement('button'); button.type = 'button'; button.className = 'event-option'; button.textContent = option.label; button.disabled = option.effect.type === 'gold' && gold + option.effect.amount < 0; button.addEventListener('click', () => choose(option.effect, option.result)); options.append(button); }
  panel.append(options); return panel;
}
