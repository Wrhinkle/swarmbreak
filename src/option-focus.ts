/** Keep the selected control focused when its option groups are rebuilt. */
export function replaceOptions(container: HTMLElement, children: HTMLElement[]) {
  const index = Array.from(container.querySelectorAll<HTMLButtonElement>('.option')).indexOf(document.activeElement as HTMLButtonElement);
  container.replaceChildren(...children);
  if (index >= 0) container.querySelectorAll<HTMLButtonElement>('.option')[index]?.focus();
}
