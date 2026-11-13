/** Keep the action and the current fight state in sync for every activation. */
export function fightPause(onChange: (paused: boolean) => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.fightPause = '';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  let paused = false;
  const update = () => {
    button.textContent = paused ? 'Resume' : 'Pause';
    status.textContent = paused ? 'Fight paused' : 'Fight running';
  };
  button.addEventListener('click', () => {
    paused = !paused;
    update();
    onChange(paused);
  });
  update();
  return { button, status };
}
