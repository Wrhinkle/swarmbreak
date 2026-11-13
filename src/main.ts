import { addFeedback, drawFeedback } from './desktop-feedback';
import { fightActions } from './fight-actions';
import { knownAction } from './known-action';
import { readiness, readinessProgress } from './readiness';
import { desktopHit, desktopRows } from './desktop-battlefield';
import { turnOrder } from './turn-order';
import { mobileBattlefield } from './mobile-battlefield';
import { fightPaint } from './fight-paint';
import { hudHealth, hudLocation } from './hud';
import { orderSelectors } from './order-controls';
import { lockTravelControls, mapIconPaths, mapPinAction, mapPositions } from './map';
import { countdownLineText } from './countdown';
import { CREW_MAX, ROLE_STATS, ROUTINES, SLOTS_MAX, SLOTS_START, TICK_MS, TIER_SCALE } from './library';
import type { Routine } from './library';
import { createCombat, order, step, threat } from './combat';
import type { CombatState } from './combat';
import { loadManifest, loadRun, openedRun, refreshRun, openingDue, RunOpeningError } from './live-run';
import { currentRun, exportSave, finishRun, importSave, loadSave, rollover, writeSave } from './save';
import type { CrewMember, Save } from './save';
import type { Creature, EventEffect, Manifest, MapNode, Run, RunAct } from './types';
import { fightExplanation, markWalkthroughSeen, orderExplanation } from './walkthrough';

/** What the map says about a fight before the player picks it: who is there and how strong the pack is. Empty for a mystery room. */
export function roomFoes(creatures: Creature[], n: Pick<MapNode, 'encounter'>, masked: boolean): string {
  if (masked || !n.encounter?.length) return '';
  const foes = n.encounter.map(id => creatures.find(c => c.id === id)!), names = [...new Set(foes.map(c => c.name))];
  return `${names.map(name => { const count = foes.filter(c => c.name === name).length; return count > 1 ? `${name} ×${count}` : name; }).join(', ')} · threat ${threat(foes)}`;
}
export function roomType(kind: string, hidden: boolean): string {
  return hidden ? 'Mystery' : kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function fighterHealth(name: string, hp: number, maxHp: number, shield: number): string {
  return `${name}: ${Math.ceil(hp)} / ${maxHp} HP${shield ? ` · ${Math.ceil(shield)} shield` : ''}`;
}

const root = document.querySelector<HTMLElement>('#app')!, live = document.querySelector<HTMLElement>('#live')!;
let manifest: Manifest, run: Run, save: Save, screen = 'title', selectedCamp = -1, room: MapNode | null = null;
let combat: CombatState | null = null, speed = 1, paused = false, animation = 0, lastTime = 0, accumulator = 0, notice = '', inspected = '', images = new Map<string, HTMLImageElement>();
let fightLayoutCleanup = () => {};
let flashes: ReturnType<typeof addFeedback> = [];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
export function renderRoster(roster: HTMLElement, fighters: CombatState['fighters'], tick = 0, events: CombatState['events'] = [], state?: CombatState) {
  const actions = fightActions(fighters, events);
  roster.replaceChildren();
  for (const side of ['crew', 'enemy'] as const) {
    const group = el('div');
    group.append(stageLabel(side === 'crew' ? 'Crew' : 'Enemies'));
    for (const f of fighters.filter(f => f.side === side)) group.append(el('p', `${fighterHealth(f.creature.name, f.hp, f.maxHp, f.shield)} · ${readiness(f, tick)}${state && knownAction(state, f) ? ` · ${knownAction(state, f)}` : ''}${actions.has(f.id) ? ` · ${actions.get(f.id)}` : ''}`));
    roster.append(group);
  }
}
const append = (p: HTMLElement, ...children: (HTMLElement | string)[]) => { for (const c of children) p.append(c); };
const btn = (label: string, action: () => void, disabled = false, cls = '') => { const b = el('button', label, cls); b.type = 'button'; b.disabled = disabled; b.addEventListener('click', action); return b; };
const clear = () => { fightLayoutCleanup(); fightLayoutCleanup = () => {}; root.replaceChildren(); root.className = `stage screen-${screen}`; if (['map','crew','room','fight','fight-result','choice'].includes(screen)) renderHud(); };
const announce = (s: string) => { live.textContent = s; };
const persist = () => writeSave(save);
const today = () => save.today!;
const act = (): RunAct => run.acts[today()?.act ?? 0];
const creature = (a: RunAct, id: string) => a.creatures.find(c => c.id === id)!;
const maxHp = (c: Creature) => Math.round(ROLE_STATS[c.role].hp * TIER_SCALE[c.tier].hp);
const member = (c: Creature, recruited: boolean, active = true): CrewMember => ({ creature: structuredClone(c), hp: maxHp(c), routines: [...c.routines].slice(0, SLOTS_START), slots: SLOTS_START, recruited, active });
function heading(kicker: string, title: string, text = '') { append(root, el('div', kicker, 'eyebrow'), el('h1', title)); if (text) root.append(el('p', text)); }
function stageLabel(text: string, level = 2) { const label=el('div',text,level===1?'stage-title':'stage-subtitle'); label.setAttribute('role','heading'); label.setAttribute('aria-level',String(level)); return label; }
function stageHeading(kicker: string, title: string, text = '') { append(root,el('div',kicker,'eyebrow'),stageLabel(title,1)); if(text) root.append(el('p',text)); }
export function renderCard(data: { name: string; effect: string; cost?: string; art?: string; icon?: string; portrait?: string }) { const card=el('section',undefined,'paper card'); if(data.portrait) { const portrait=el('div',undefined,'crew-portrait'); portrait.style.backgroundImage=`url("${data.portrait}")`; portrait.setAttribute('aria-hidden','true'); card.append(portrait); } else if(data.art) { const img=el('img',undefined,'card-art'); img.src=data.art; img.alt=''; card.append(img); } else { const icon=el('span',data.icon ?? '✦','card-icon'); icon.setAttribute('aria-hidden','true'); card.append(icon); } const body=el('div',undefined,'card-body'); append(body,el('div',data.name,'card-name')); if(data.cost !== undefined) body.append(el('div',data.cost,'card-cost')); body.append(el('p',data.effect,'card-effect')); card.append(body); return card; }
function credit(a: RunAct) { const p = el('p', undefined, 'credit'); p.append('Source: '); const link = el('a', a.site.name); try { const u = new URL(a.site.url); if (u.protocol === 'https:' || u.protocol === 'http:') { link.href = u.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; } } catch { /* plain text if the source URL is invalid */ } p.append(link, ` — ${a.site.note}`); root.append(p); }
function loadArt(a: RunAct) { images = new Map(); for (const src of [...[...run.crew, ...a.creatures, ...save.camp.map(x => x.ally)].map(c => c.sprite), ...(a.art?.backdrops ?? [])]) { if (!src || images.has(src)) continue; const img = new Image(); img.src = src; images.set(src, img); } }
function countdownLine(prefix: string) { const p = el('p', countdownLineText(prefix, manifest.nextOpensAt, Date.now()), 'muted'); p.dataset.countdown = prefix; return p; }
const time = () => performance.now();
function resumeRun() { loadArt(act()); if (!save.walkthroughSeen && !today().node && !today().pending) { showHelp(resumeRun); return; } if (today().pending === 'win') showEndChoice(); else if (today().pending?.startsWith('victory:')) { room = act().nodes.find(n => n.id === today().pending!.slice(8)) ?? null; room ? showVictory('Your victory is saved.') : showMap(); } else if (today().pending) { room = act().nodes.find(n => n.id === today().pending) ?? null; room ? enterRoom(room, true) : showMap(); } else showMap(); }
function showHelp(back: () => void) {
  markWalkthroughSeen(save);
  persist();
  const steps = [
    { title: 'The daily run', text: 'Everyone gets the same daily run, inspired by three public sites. You have one official attempt each day.', art: run.acts[0].art?.backdrops[0] },
    { title: 'Choose your route', text: 'Follow the map through fights and harder elite fights to the boss. Events offer choices, shops sell routines, rest rooms help you prepare, and treasure offers rewards. Mystery rooms hide their type until you enter.', art: run.acts[0].art?.map },
    { title: 'Your crew', text: 'Your crew fights using routines: if-then instructions checked in priority order. Between rooms, open Crew & routines to equip and reorder them.', art: run.crew[0]?.sprite },
    { title: 'In a fight', text: fightExplanation, art: run.acts[0].art?.backdrops[0] },
    { title: 'Give an order', text: orderExplanation, art: run.acts[0].art?.backdrops[0] },
    { title: 'Bring an ally home', text: 'Recruit allies along the way. Win the run and choose one recruited ally to keep in your camp for a future attempt.', art: run.acts[0].art?.backdrops[0] },
  ];
  let index = 0;
  const done = () => { back(); };
  const show = () => { screen='help'; clear(); root.scrollTop=0; const step=steps[index]; const panel=el('section',undefined,'paper walkthrough'); if(step.art) { const art=el('div',undefined,index===2?'walkthrough-art walkthrough-sprite':'walkthrough-art'); art.style.backgroundImage=`url("${step.art}")`; art.setAttribute('aria-hidden','true'); panel.append(art); } append(panel,el('div',`How to play · ${index+1} / ${steps.length}`,'eyebrow'),el('h1',step.title),el('p',step.text)); const controls=el('div',undefined,'bar'); append(controls,btn(index===steps.length-1?'Finish':'Next',()=>{ if(++index===steps.length) done(); else show(); }),btn('Skip',done)); panel.append(controls); root.append(panel); };
  show();
}
function renderHud() {
  const t=today(), a=act(), hud=el('header',undefined,'hud'); hud.setAttribute('aria-label','Run status');
  const health=hudHealth(t,combat,screen==='fight'); const roster=el('div',undefined,'hud-roster'); roster.setAttribute('aria-label','Crew health');
  for(const [i,c] of t.crew.filter(c=>c.active).entries()) { const fighter=screen==='fight' ? combat?.fighters.filter(f=>f.side==='crew'&&!f.summonedBy)[i] : undefined; const hp=health[i], maximum=fighter?.maxHp ?? maxHp(c.creature); const item=el('div',undefined,'hud-member'); const img=el('div',undefined,'hud-portrait'); img.style.backgroundImage=`url("${c.creature.sprite}")`; img.setAttribute('aria-hidden','true'); const info=el('div'); const meter=el('progress'); meter.max=maximum; meter.value=Math.max(0,hp); meter.setAttribute('aria-label',`${c.creature.name}: ${Math.ceil(hp)} of ${maximum} HP`); append(info,el('span',c.creature.name),meter); append(item,img,info); roster.append(item); }
  const current=room ?? a.nodes.find(n=>n.id===t.node); const details=el('div',hudLocation(t,current ?? undefined), 'hud-details'); details.append(el('small',`${a.site.name} · ${run.swarm.name}`));
  const menu=el('details',undefined,'hud-menu'), summary=el('summary','Menu'); const actions=el('div',undefined,'hud-actions'); append(actions,btn('Settings',showSettings),btn('How to play',()=>showHelp(resumeRun)),btn('Title',showTitle),btn('Abandon run',()=>{ if(window.confirm('Abandon this run? This counts as a loss.')) { save=finishRun(save,'loss',null,[]); persist(); showResult(); } })); append(menu,summary,actions); append(hud,roster,details,menu); root.append(hud);
}
function showSettings() {
  const wasRunning=screen==='fight' && !paused; const pauseButton=root.querySelector<HTMLButtonElement>('[data-fight-pause]'); if(wasRunning) pauseButton?.click();
  const dialog=el('dialog',undefined,'settings-dialog'); const title=el('div','Settings','stage-subtitle'); title.id='settings-title'; dialog.setAttribute('aria-labelledby',title.id);
  const motion=btn('',()=>{ document.body.classList.toggle('reduce-motion'); update(); }); const update=()=>{ const reduced=document.body.classList.contains('reduce-motion'); motion.textContent=`Reduced motion: ${reduced?'on':'off'}`; motion.setAttribute('aria-pressed',String(reduced)); }; update();
  const close=()=>dialog.close(); append(dialog,title,motion,btn('Back',close)); dialog.addEventListener('close',()=>{dialog.remove(); if(wasRunning) pauseButton?.click();}); root.append(dialog); dialog.showModal();
}
function showTitle() {
  screen = 'title'; clear(); const art=run.acts[0].art?.backdrops[0]; if(art) root.style.setProperty('--title-art', `url("${art}")`); const hero=el('section',undefined,'title-hero'); append(hero,el('div','SWARMBREAK','title-brand'),el('div',run.swarm.name,'eyebrow'),el('div',run.title,'title-name'),el('p',run.swarm.blurb));
  const result = save.results[manifest.runId] ?? (save.today?.runId === manifest.runId ? save.today.result : null);
  const controls=el('div',undefined,'title-controls');
  if(result) controls.append(el('p',`Official result: ${result}.`));
  else if(save.today?.runId===manifest.runId) controls.append(btn('Continue',resumeRun,false,'plate'));
  else if(!(Date.parse(manifest.opensAt)<=Date.now())) controls.append(btn('Run not open yet',start,true,'plate'));
  else { if(save.camp.length) hero.append(campChoices(save.camp.map(c=>({name:c.ally.name,runId:c.runId})),selectedCamp,value=>{selectedCamp=value;})); controls.append(btn('Play',start,false,'plate')); }
  append(controls,btn(`Camp · ${save.camp.length}`,showCamp,false,'plate'),btn('How to play',()=>showHelp(showTitle),false,'plate'),btn('Save / import',showTransfer)); append(hero,controls,countdownLine('Next run opens in')); root.append(hero); credit(run.acts[0]); root.append(el('p','The swarm is fiction and says nothing about the real organization.','credit'));
}
export function campChoices(allies: { name: string; runId: string }[], selected: number, onChange: (value: number) => void) {
  const group=el('fieldset',undefined,'option-buttons'); group.append(el('legend','Bring a camp ally'));
  const choices=[{label:'Bring no camp ally',value:-1},...allies.map((ally,i)=>({label:`${ally.name} · ${ally.runId}`,value:i}))];
  const buttons: HTMLButtonElement[]=[];
  for(const choice of choices) {
    const button=btn(choice.label,()=>{ selected=choice.value; buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(choices[i].value===selected))); onChange(selected); },false,'option');
    button.setAttribute('aria-pressed',String(choice.value===selected)); buttons.push(button); group.append(button);
  }
  return group;
}
function start() { if (save.results[manifest.runId] || save.today || !(Date.parse(manifest.opensAt) <= Date.now())) return; const crew = run.crew.map(c => member(c,false)); if (selectedCamp >= 0 && save.camp[selectedCamp]) crew.push(member(save.camp[selectedCamp].ally,false,crew.length < CREW_MAX)); crew.forEach((c,i) => c.active = i < CREW_MAX); save.today = { runId: run.id, node: null, cleared: [], crew, deck: crew.flatMap(c => c.routines), gold: 0, seed: run.seed, result: null, act: 0, pending: null }; persist(); loadArt(act()); if (!save.walkthroughSeen) showHelp(showMap); else showMap(); }
function showCamp() { screen = 'camp'; clear(); heading('The survivors', 'Camp', 'Allies kept from victorious runs can join a future attempt.'); if (!save.camp.length) { const empty=el('section',undefined,'paper'); empty.append(el('p','Your camp is quiet. Recruit an ally and win a run to bring one home.')); root.append(empty); } for (const [i,c] of save.camp.entries()) { const s = renderCard({name:c.ally.name, art:c.ally.sprite, effect:c.ally.routines.map(r => routineText(ROUTINES[r])).join(' / ')}); append(s,el('p',c.ally.blurb),el('p',`Earned in ${c.runId} · ${c.wonAt} · ${c.sites.join(', ')}`),btn(selectedCamp === i ? 'Selected for next run' : 'Bring on next run',() => { selectedCamp=i; showCamp(); },selectedCamp === i)); root.append(s); } root.append(btn('Back',showTitle,false,'primary')); }
function showTransfer() { screen='transfer'; clear(); heading('Keep a copy','Save data'); const box=el('textarea'); box.value=exportSave(save); box.setAttribute('aria-label','Save JSON'); root.append(box); const bar=el('div',undefined,'bar'); append(bar,btn('Copy export',async()=>{ try { await navigator.clipboard.writeText(box.value); notice='Copied.'; } catch { notice='Select the text and copy it.'; } status.textContent=notice; }),btn('Import JSON',()=>{ try { save=rollover(importSave(box.value),manifest); persist(); selectedCamp=-1; showTitle(); } catch { status.textContent='Invalid save. Nothing was imported.'; } }),btn('Back',showTitle)); const status=el('p','','muted'); root.append(bar,status); }
const icons: Record<string,string> = { fight:'⚔',elite:'◆',rest:'☕',event:'?',shop:'¤',treasure:'✦',boss:'⬡' };
function showMap() { screen='map'; room=null; clear(); root.scrollTop=0; const t=today(), a=act(); stageHeading(`Act ${(t.act ?? 0)+1} · ${a.theme}`,'The map',`Gold ${t.gold} · ${t.crew.filter(c=>c.active && c.hp>0).length} active crew`); const nav=el('div',undefined,'bar'); append(nav,btn('Crew & routines',showCrew),btn('Title',showTitle)); root.append(nav); if (notice) { root.append(el('p',notice)); notice=''; }
  const legal = t.node ? a.nodes.find(n=>n.id===t.node)?.next ?? [] : a.nodes.filter(n=>n.floor===0).map(n=>n.id); const nextFloor = t.node ? (a.nodes.find(n=>n.id===t.node)?.floor ?? 0)+1 : 0; storyPanel(a,nextFloor,!t.node);
  const routes=el('section',undefined,'paper routes'); const current=a.nodes.find(n=>n.id===t.node); append(routes,stageLabel('Choose your next room'),el('p',current ? `Current position: ${current.label}` : 'Current position: the start'));
  routes.append(el('p','Choose a highlighted pin to travel, or tap any other pin to inspect it.')); const positions=mapPositions(a.nodes); const sheet=mapSheet(a,t.cleared,legal,t.node,positions,choose);
  let moving=false;
  function choose(n:MapNode) { if(moving || !legal.includes(n.id)) return; moving=true; t.pending=n.id; persist(); lockTravelControls(root); const token=sheet.querySelector<HTMLElement>('.map-token')!, p=positions.get(n.id)!; token.scrollIntoView({block:'center'}); requestAnimationFrame(()=>{ token.style.left=`${p.x}%`; token.style.top=`${p.y}%`; }); announce(`Traveling to ${n.hidden?'a mystery room':n.label}.`); const reduced=document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches; window.setTimeout(()=>{if(sheet.isConnected) enterRoom(n);},reduced?0:450); }
  for(const n of a.nodes.filter(n=>legal.includes(n.id))){ const masked=!!n.hidden&&!t.cleared.includes(n.id); const foes=roomFoes(a.creatures,n,masked); routes.append(btn(`${masked?'?':icons[n.kind]} ${roomType(n.kind,masked)} · ${masked?'Unknown':n.label}${foes&&` · ${foes}`}`,()=>choose(n),false,'route plate')); } root.append(routes,sheet); credit(a); }
function storyPanel(a:RunAct,floor:number,opening:boolean){ const story=a.story; if(!story)return; const p=el('section',undefined,'paper story'); const top=Math.max(...a.nodes.map(n=>n.floor)); if(opening)p.append(el('p',story.intro)); if(floor>=top)p.append(el('p',story.bossIntro)); else { const c=story.chapters[Math.min(2,Math.floor(floor/5))]; if(c)append(p,stageLabel(c.title),el('p',c.text)); } root.append(p); }
function mapSheet(a:RunAct,cleared:string[],legal:string[],current:string|null,positions:Map<string,{x:number;y:number}>,choose:(n:MapNode)=>void){ const sheet=el('div',undefined,'sheet'); if(a.art?.map)sheet.style.backgroundImage=`url("${a.art.map}")`; const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('preserveAspectRatio','none'); svg.setAttribute('aria-hidden','true');
  for(const n of a.nodes)for(const id of n.next){ const p=positions.get(n.id),q=positions.get(id); if(!p||!q)continue; const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.setAttribute('x1',String(p.x));line.setAttribute('y1',String(p.y));line.setAttribute('x2',String(q.x));line.setAttribute('y2',String(q.y)); line.setAttribute('class',cleared.includes(n.id)&&cleared.includes(id)?'walked':cleared.includes(n.id)&&legal.includes(id)?'open':''); svg.append(line); } sheet.append(svg);
  const inspect=(n:MapNode)=>{ const masked=!!n.hidden&&!cleared.includes(n.id), dialog=el('dialog',undefined,'settings-dialog'); const title=el('div',`Floor ${n.floor+1}: ${masked?'Mystery room':`${roomType(n.kind,false)} · ${n.label}`}`,'stage-subtitle'); title.id='map-inspection-title'; dialog.setAttribute('aria-labelledby',title.id); const foes=roomFoes(a.creatures,n,masked); append(dialog,title,el('p',foes || (masked?'The room is unknown.':'No enemies shown.')),btn('Close',()=>dialog.close())); dialog.addEventListener('close',()=>dialog.remove()); sheet.append(dialog); dialog.showModal(); };
  for(const n of a.nodes){ const done=cleared.includes(n.id), masked=!!n.hidden&&!done, foes=roomFoes(a.creatures,n,masked), p=positions.get(n.id)!, available=legal.includes(n.id), b=btn('',()=>mapPinAction(n,legal,choose,inspect),false,`pin ${masked?'mystery':n.kind}${done?' done':''}${n.id===current?' current':''}${available?' available':' inspect'}`); b.style.left=`${p.x}%`; b.style.top=`${p.y}%`; b.setAttribute('aria-label',`Floor ${n.floor+1}: ${masked?'mystery room':`${n.kind}, ${n.label}`}${foes&&`, ${foes}`}${done?', cleared':''}${n.id===current?', current position':''}${available?', travel':', inspect'}`); const badge=el('b'); const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('aria-hidden','true'); const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',mapIconPaths[masked?'mystery':n.kind] ?? mapIconPaths.mystery); icon.append(path); badge.append(icon); if(foes)b.title=foes; append(b,badge,el('small',roomType(n.kind,masked)+(foes&&` ${threat(n.encounter!.map(id=>creature(a,id)))}`))); sheet.append(b); }
  const token=el('div','●','map-token'); token.setAttribute('aria-label',current?'Your position':'Your position: start'); token.setAttribute('role','img'); const pos=current?positions.get(current):undefined; token.style.left=`${pos?.x ?? 50}%`; token.style.top=`${pos?.y ?? 98}%`; sheet.append(token); return sheet; }

function routineText(r: Routine | undefined) { if (!r) return 'Unknown routine'; const pct=Math.round((r.arg ?? 0)*100); const cond: Record<string,string>={always:'Always',self_hp_below:`If self is under ${pct}% HP`,ally_hp_below:`If an ally is under ${pct}% HP`,ally_down:'If an ally is down',self_unshielded:'If self has no shield',foe_shielded:'If a foe has a shield',foe_hp_below:`If a foe is under ${pct}% HP`,foes_at_least:`If there are at least ${r.arg} foes`,self_corrupted:'If self is corrupted'}; const action: Record<string,string>={strike:'Strike',heavy:'Heavy strike',sweep:'Sweep',overflow:'Break shield and strike',patch:'Patch',mend_all:'Mend all',guard_self:'Guard self',guard_ally:'Guard ally',corrupt:'Corrupt',purge:'Purge',stun:'Stun',summon:'Summon',split:'Split',steal:'Steal',mirror:'Mirror',charge:'Charge'}; return `${cond[r.condition]}: ${action[r.action]}`; }
export function restUpgradeChoice(name: string, current: Routine, onChoose: () => void) { const upgraded = ROUTINES[current.upgradesTo!]; return btn(`Upgrade ${name}: ${current.name} (${routineText(current)}) → ${upgraded.name} (${routineText(upgraded)})`, onChoose, false, 'rest-upgrade'); }
export function routineOffer(r: Routine, action: string, onChoose: () => void, disabled: boolean, cost = `${r.price}g`) { const card=renderCard({name:r.name,effect:routineText(r),cost}); card.append(btn(`${action} ${r.name}`,onChoose,disabled)); return card; }
export function routinePicker(label: string, ids: string[], value: string, onChange: (value: string) => void) {
  const picker=el('details',undefined,'routine-picker');
  const current=ROUTINES[value];
  picker.append(el('summary',`${label}: ${current?.name ?? 'Empty'} · Change`));
  picker.append(btn('Clear slot',()=>onChange(''),!value));
  for(const id of ids) {
    const r=ROUTINES[id]; if(!r) continue;
    const card=routineOffer(r,id===value?'Equipped':'Equip',()=>onChange(id),id===value,'Free');
    picker.append(card);
  }
  return picker;
}
export function optionButtons(label: string, options: { value: string; label: string }[], value: string, onChange: (value: string) => void) { const group=el('fieldset',undefined,'option-buttons'); group.append(el('legend',label)); for(const option of options) { const button=btn(option.label,()=>onChange(option.value),false,'option'); button.setAttribute('aria-pressed',String(option.value===value)); group.append(button); } return group; }
function showCrew() { screen='crew'; clear(); stageHeading('Between fights','Crew & routines',`Gold ${today().gold}. Earlier routines take priority. Choose a routine for each slot, or move it up or down.`); const t=today();
 for (const [i,c] of t.crew.entries()) { const s=el('section',undefined,'paper crew-panel'); const portrait=el('div',undefined,'crew-portrait'); portrait.style.backgroundImage=`url("${c.creature.sprite}")`; portrait.setAttribute('aria-hidden','true'); s.append(portrait); append(s,stageLabel(`${c.creature.name} ${c.active?'· active':'· reserve'}`),el('p',`${Math.ceil(c.hp)} / ${maxHp(c.creature)} HP · ${c.creature.blurb}`)); if(c.active) s.append(btn('Move to reserve',()=>{ if(t.crew.filter(x=>x.active).length<=1) return; c.active=false; persist(); showCrew(); },t.crew.filter(x=>x.active).length<=1)); else s.append(btn('Make active',()=>{ if(t.crew.filter(x=>x.active).length>=CREW_MAX) { notice='Move someone to reserve first.'; showCrew(); return; } c.active=true; persist(); showCrew(); }));
  for(let j=0;j<c.slots;j++){ const row=el('div',undefined,'routine'); row.append(routinePicker(`${c.creature.name} slot ${j+1}`,[...new Set(t.deck)],c.routines[j]??'',id=>{ const old=c.routines[j]; if(id && id!==old) { const used=t.crew.flatMap(x=>x.routines).filter(x=>x===id).length; if(used >= t.deck.filter(x=>x===id).length) { const holder=t.crew.flatMap((m,mi)=>m.routines.map((r,ri)=>({m,mi,ri,r}))).find(x=>x.r===id && !(x.mi===i && x.ri===j)); if(holder) { if(old) holder.m.routines[holder.ri]=old; else holder.m.routines.splice(holder.ri,1); } } } if(id) c.routines[j]=id; else c.routines.splice(j,1); c.routines=c.routines.filter(Boolean); persist(); showCrew(); })); if(c.routines[j]) { append(row,btn(`Move ${ROUTINES[c.routines[j]].name} up`,()=>{ [c.routines[j-1],c.routines[j]]=[c.routines[j],c.routines[j-1]]; persist(); showCrew(); },j===0),btn(`Move ${ROUTINES[c.routines[j]].name} down`,()=>{ [c.routines[j+1],c.routines[j]]=[c.routines[j],c.routines[j+1]]; persist(); showCrew(); },j>=c.routines.length-1)); const up=ROUTINES[c.routines[j]]?.upgradesTo; if(up) row.append(btn(`Upgrade · ${ROUTINES[up].price}g`,()=>upgrade(i,j),t.gold<ROUTINES[up].price)); } s.append(row); }
  if(c.slots<SLOTS_MAX) s.append(btn('Add slot · 50g',()=>{t.gold-=50;c.slots++;persist();showCrew();},t.gold<50)); root.append(s); }
 if(notice){root.append(el('p',notice,'danger'));notice='';} root.append(btn('Back to map',showMap)); }
function upgrade(i:number,j:number,free=false){ const t=today(),c=t.crew[i],old=c.routines[j],up=ROUTINES[old]?.upgradesTo; if(!up||(!free&&t.gold<ROUTINES[up].price))return; if(!free)t.gold-=ROUTINES[up].price; c.routines[j]=up; const pos=t.deck.indexOf(old); if(pos>=0)t.deck[pos]=up; persist(); showCrew(); }
function enterRoom(n:MapNode, resumed=false) { room=n; if(['fight','elite','boss'].includes(n.kind)){startFight(n);return;} screen='room'; clear(); stageHeading(`${icons[n.kind]} ${n.kind} · Floor ${n.floor+1}`,n.label); const panel=el('section',undefined,'paper'); root.append(panel);
 if(n.kind==='rest'){ panel.append(el('p','A quiet corner. Choose one way to prepare.')); panel.append(btn('Heal crew by 30%',()=>{for(const c of today().crew)c.hp=Math.min(maxHp(c.creature),c.hp+Math.round(maxHp(c.creature)*.3));completeRoom();})); const eligible=today().crew.flatMap((c,i)=>c.routines.map((r,j)=>({i,j,r}))).filter(x=>ROUTINES[x.r]?.upgradesTo); for(const x of eligible) panel.append(restUpgradeChoice(today().crew[x.i].creature.name, ROUTINES[x.r],()=>{ const c=today().crew[x.i],up=ROUTINES[x.r].upgradesTo!; c.routines[x.j]=up; const k=today().deck.indexOf(x.r); if(k>=0)today().deck[k]=up; completeRoom(); })); }
 if(n.kind==='event'){ const e=act().events.find(e=>e.id===n.eventId)!; if(e.art){const img=new Image();img.src=e.art;img.alt='';img.className='event-art';img.onerror=()=>img.remove();panel.append(img);} append(panel,stageLabel(e.title),el('p',e.text)); for(const o of e.options) panel.append(btn(o.label,()=>{applyEffect(o.effect);notice=o.result;completeRoom();},o.effect.type==='gold'&&today().gold+o.effect.amount<0)); }
 if(n.kind==='shop'){ panel.append(el('p',`Browse the shelf · ${today().gold} gold`)); for(const id of act().shop){ const r=ROUTINES[id]; panel.append(routineOffer(r,'Buy',()=>{today().gold-=r.price;today().deck.push(id);persist();enterRoom(n,true);},!r.price||today().gold<r.price)); } panel.append(btn('Leave shop',completeRoom)); }
 if(n.kind==='treasure'){ panel.append(el('p','Choose what to carry from the drawer.')); const gold=renderCard({name:'40 gold',effect:'Add gold to your supply.',cost:'Free',icon:'¤'}); gold.append(btn('Take 40 gold',()=>{today().gold+=40;completeRoom();})); panel.append(gold); const id=act().shop[0]; if(id)panel.append(routineOffer(ROUTINES[id],'Take',()=>{today().deck.push(id);completeRoom();},false,'Free')); }
 if(resumed) root.append(el('p','Your room is ready to continue.','muted')); }
function applyEffect(e:EventEffect){ const t=today(); switch(e.type){case 'gold':t.gold=Math.max(0,t.gold+e.amount);break;case 'routine':t.deck.push(e.id);break;case 'heal':case 'damage':for(const c of t.crew)c.hp=Math.max(0,Math.min(maxHp(c.creature),c.hp+Math.round(maxHp(c.creature)*e.amount*(e.type==='heal'?1:-1))));break;} }
function completeRoom(){ if(!room)return; const n=room,t=today(); if(n.reward){const c=creature(act(),n.reward); if(c){t.crew.push(member(c,true,t.crew.filter(x=>x.active).length<CREW_MAX)); t.deck.push(...c.routines); notice=`${c.name} joined the crew. ${notice}`;}} t.cleared.push(n.id);t.node=n.id;t.pending=null; if(n.kind==='boss'){ if((t.act??0)<run.acts.length-1){t.act=(t.act??0)+1;t.node=null;loadArt(act());notice=`${act().story?run.acts[(t.act??1)-1].story?.outro??'':'The act is clear. A new site awaits.'}`;}else{t.pending='win';persist();showEndChoice();return;} } persist();showMap(); }
function startFight(n:MapNode){ screen='fight'; clear(); stageHeading(`${n.kind} · Floor ${n.floor+1}`,n.label,n.kind==='boss'&&act().story?act().story!.bossIntro:'Tap an enemy to inspect it.'); const t=today(); combat=t.combat ?? createCombat(t.crew.filter(c=>c.active).map(c=>({creature:{...c.creature,routines:[...c.routines]},hp:c.hp})),(n.encounter??[]).map(id=>creature(act(),id)),t.seed); t.combat=combat; persist(); root.querySelector('.hud')?.remove(); renderHud(); root.prepend(root.lastElementChild!); paused=false; speed=1; inspected=''; flashes=[];
 const canvas=el('canvas'); canvas.width=900;canvas.height=420;canvas.setAttribute('aria-label','Fight: crew on the left, enemies on the right. Tap an enemy for details.');canvas.tabIndex=0; root.append(canvas); const battlefield=mobileBattlefield(id=>{const f=combat?.fighters.find(f=>f.id===id);if(f){inspected=id;detail.textContent=`${f.creature.name}: ${f.creature.blurb} ${f.routines.map(r=>routineText(ROUTINES[r])).join(' · ')}`;}}); root.append(battlefield.element); const orderStrip=el('section',undefined,'turn-order'); orderStrip.setAttribute('aria-label','Upcoming turns; stuns or defeats may change the order'); root.append(orderStrip); let orderKey=''; const updateOrder=()=>{ if(!combat)return; const upcoming=turnOrder(combat.fighters,combat.t); const key=JSON.stringify(upcoming.map(f=>f.id)); if(key===orderKey)return; orderKey=key; const label=el('strong','Up next (may change)'); const names=upcoming.map(f=>el('span',`${f.side === 'crew' ? 'Crew' : 'Enemy'}: ${f.creature.name}`)); orderStrip.replaceChildren(label,...names); }; const fightRoster=el('section',undefined,'paper fight-roster'); fightRoster.setAttribute('aria-label','Fighter health'); fightRoster.tabIndex=0; root.append(fightRoster); const controls=el('div',undefined,'bar fight-controls'); const pause=btn('Pause',()=>{paused=!paused;pause.textContent=paused?'Resume':'Pause';if(!paused){lastTime=0;animation=requestAnimationFrame(frame);}}); pause.dataset.fightPause=''; controls.append(pause); for(const x of [1,2,4])controls.append(btn(`${x}×`,()=>{speed=x;})); const orderControls=orderSelectors(combat.fighters.filter(f=>f.side==='crew'&&!f.summonedBy).map(f=>({id:f.id,name:f.creature.name,routines:f.routines.map(id=>({id,label:routineText(ROUTINES[id])}))})), (who,choice)=>{ if(combat){const before=combat.queued;combat=order(combat,who,choice); today().combat=combat; persist(); renderRoster(fightRoster,combat.fighters,combat.t,combat.events,combat); battlefield.update(combat.fighters,combat.t,combat.events,combat); updateStatus(); announce(combat.queued&&!before?'Order queued.':'Order unavailable.');}}, () => combat!); controls.append(orderControls.element); root.append(controls); const detail=el('p',n.kind==='boss'&&act().story?act().story!.bossIntro:'Tap an enemy to read its dossier.','muted fight-detail');detail.tabIndex=0;root.append(detail);
 canvas.addEventListener('click',ev=>{ const rect=canvas.getBoundingClientRect(),x=(ev.clientX-rect.left)*canvas.width/rect.width,y=(ev.clientY-rect.top)*canvas.height/rect.height; const enemies=combat?.fighters.filter(f=>f.side==='enemy')??[]; const rows=desktopRows(enemies,'enemy'); const idx=desktopHit(rows,x,y); if(idx>=0){const f=enemies[idx];inspected=f.id;detail.textContent=`${f.creature.name}: ${f.creature.blurb} ${f.routines.map(r=>routineText(ROUTINES[r])).join(' · ')}`;} });
 function draw(){
  if(!combat)return;
  const state=combat, crew=state.fighters.filter(f=>f.side==='crew'), enemies=state.fighters.filter(f=>f.side==='enemy');
  const groups=([['crew',crew],['enemy',enemies]] as const).map(([side,list])=>({side,list,rows:desktopRows(list,side)}));
  const height=Math.max(420,...groups.map(g=>(g.rows.at(-1)?.bottom??0)+10));
  if(canvas.height!==height)canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,900,height);ctx.imageSmoothingEnabled=true;ctx.fillStyle='#203730';ctx.fillRect(0,0,900,height);
  const back=room?images.get(act().art?.backdrops[Math.min(2,Math.floor(room.floor/5))]??''):undefined;
  if(back?.complete&&back.naturalWidth){const k=Math.max(900/back.naturalWidth,height/back.naturalHeight);ctx.drawImage(back,(900-back.naturalWidth*k)/2,(height-back.naturalHeight*k)/2,back.naturalWidth*k,back.naturalHeight*k);ctx.fillStyle='rgba(16,26,23,.38)';ctx.fillRect(0,0,900,height);}
  for(const {side,list,rows} of groups) list.forEach((f,i)=>{
   const {x,y,size,bottom}=rows[i], img=images.get(f.creature.sprite);
   const recent=state.events.filter(e=>e.actor===f.id||e.target===f.id).slice(-1)[0], since=recent?state.t-recent.t:99;
   let row=0;if(f.hp<=0)row=3;else if(since<5)row=recent!.kind==='damage'&&recent!.target===f.id?2:recent!.kind==='action'&&recent!.actor===f.id?1:0;
   const frame=row===3?Math.min(5,since):row?Math.min(5,Math.floor(since*6/5)):Math.floor(time()/160)%6;
   if(f.creature.puppet&&img?.complete&&img.naturalWidth>0){const now=time(),dx=row===1?-4*Math.sin(Math.PI*Math.min(1,since/5)):row===2?Math.sin(now/30)*4:0,dy=row===3?Math.min(4,since):Math.sin(now/520)*4;ctx.save();ctx.globalAlpha=row===3?Math.max(0,1-since/8):1;ctx.drawImage(img,x+dx,y+dy,size,size);ctx.restore();}
   else if(img?.complete&&img.naturalWidth>0&&img.naturalHeight>0){const cell=img.naturalWidth/6;ctx.drawImage(img,frame*cell,row*img.naturalHeight/4,cell,img.naturalHeight/4,x,y,size,size);}
   else{ctx.fillStyle=side==='crew'?'#d8c4a0':'#4c9385';ctx.fillRect(x,y,size,size);}
   // Back the labels so they remain readable over any backdrop.
   ctx.fillStyle='rgba(16,26,23,.9)';ctx.fillRect(x,y+size,size,bottom-y-size);
   ctx.fillStyle='#f3e6ca';ctx.font='15px Georgia';ctx.fillText(f.creature.name,x+4,y+size+16,size-8);
   ctx.fillStyle='#29312a';ctx.fillRect(x+4,y+size+20,size-8,12);ctx.fillStyle='#cc8062';ctx.fillRect(x+4,y+size+20,(size-8)*Math.max(0,Math.min(1,f.hp/f.maxHp)),12);
   ctx.fillStyle='#f3e6ca';ctx.font='12px sans-serif';ctx.fillText(`${Math.ceil(f.hp)} / ${f.maxHp} HP · ${Math.ceil(f.shield)} shield`,x+4,y+size+45,size-8);
   ctx.fillStyle='#29312a';ctx.fillRect(x+4,y+size+49,size-8,5);ctx.fillStyle='#82cfbe';ctx.fillRect(x+4,y+size+49,(size-8)*Math.min(1,Math.max(0,f.shield/f.maxHp)),5);
   const progress=readinessProgress(f,state.t);ctx.fillStyle='#29312a';ctx.fillRect(x+4,y+size+58,size-8,10);ctx.fillStyle=progress===1?'#ffdf83':'#8bb7ed';ctx.fillRect(x+4,y+size+58,(size-8)*(progress??0),10);
   ctx.fillStyle='#f3e6ca';ctx.fillText(progress===null?'ATB: unavailable':progress===1?'ATB: ready':`ATB: ${Math.round(progress*100)}%`,x+4,y+size+82,size-8);
   if(inspected===f.id){ctx.strokeStyle='#b3f1da';ctx.strokeRect(x,y,size,bottom-y);}
   drawFeedback(ctx,flashes,f.id,x+size/2,y+size/4,state.t);
  });
 }
 const { paint, cleanup } = fightPaint(matchMedia('(max-width: 600px)'), draw);
 const updateStatus = () => { if (combat) orderControls.update(); };
 fightLayoutCleanup = cleanup;
 function frame(time:number){if(screen!=='fight'||!combat||paused)return;if(!lastTime)lastTime=time;accumulator+=Math.min(100,time-lastTime)*speed;lastTime=time;let changed=false;while(accumulator>=TICK_MS&&!combat.result){accumulator-=TICK_MS;combat=step(combat);changed=true;flashes=addFeedback(flashes,combat.events,combat.t); combat.events=combat.events.filter(e=>combat!.t-e.t<6); } if(changed){today().combat=combat;persist();renderRoster(fightRoster,combat.fighters,combat.t,combat.events,combat); battlefield.update(combat.fighters,combat.t,combat.events,combat); updateOrder(); updateStatus(); const meters=root.querySelectorAll<HTMLProgressElement>('.hud progress'); combat.fighters.filter(f=>f.side==='crew'&&!f.summonedBy).forEach((f,i)=>{const m=meters[i]; if(m){m.value=Math.max(0,f.hp); m.setAttribute('aria-label',`${f.creature.name}: ${Math.ceil(f.hp)} of ${f.maxHp} HP`);}});} paint();if(combat.result){ finishFight();return;}animation=requestAnimationFrame(frame); }
 renderRoster(fightRoster,combat.fighters,combat.t,combat.events,combat);battlefield.update(combat.fighters,combat.t,combat.events,combat);updateOrder();updateStatus();paint();lastTime=0;accumulator=0;cancelAnimationFrame(animation);animation=requestAnimationFrame(frame);
}
function finishFight(){ if(!combat||!room)return; cancelAnimationFrame(animation);const t=today(), result=combat.result; const originals=combat.fighters.filter(f=>f.side==='crew'&&!f.summonedBy); let idx=0;for(const c of t.crew.filter(c=>c.active)){c.hp=originals[idx++]?.hp??0;}t.gold=Math.max(0,t.gold-combat.goldStolen);delete t.combat; if(result==='loss'){save=finishRun(save,'loss',null,[]);persist();announce('Fight lost. Your run is over.');showResult();return;} const reward=room.kind==='boss'?100:room.kind==='elite'?60:30;t.gold+=reward; let text=`Victory! ${reward} gold.`; if(room.kind==='elite'&&act().shop.length){const id=act().shop[(room.floor+run.seed)%act().shop.length];t.deck.push(id);text+=` Found ${ROUTINES[id].name}.`;} announce(text); t.pending=`victory:${room.id}`; persist(); showVictory(text); }
function showVictory(text:string){ screen='fight-result';clear();stageHeading('The swarm retreats','Victory',text);const panel=el('section',undefined,'paper'); panel.append(btn('Continue',completeRoom,false,'primary')); root.append(panel); }
export function allyReward(ally: Creature, onChoose: () => void) { const card=renderCard({name:ally.name,effect:ally.blurb,cost:'Free',portrait:ally.sprite}); card.append(btn(`Keep ${ally.name}`,onChoose)); return card; }
function showEndChoice(){screen='choice';clear();stageHeading('The swarm is broken','Choose an ally',`${act().story?.outro??''} One ally recruited on this run can join your camp.`); const candidates=today().crew.filter(c=>c.recruited); for(const c of candidates){root.append(allyReward(c.creature,()=>{save=finishRun(save,'win',c.creature,run.acts.map(a=>a.site.name));persist();showResult();}));} if(!candidates.length)root.append(btn('Finish run',()=>{save=finishRun(save,'win',null,run.acts.map(a=>a.site.name));persist();showResult();}));}
function showResult(){screen='result';clear();const t=today(), won=t.result==='win';const floors=t.cleared.length;const text=`Swarmbreak ${run.id}\n${won?'CLEARED':'LOST'} · ${floors} rooms\n${won?'⬡'.repeat(Math.min(16,floors)):'⬡'.repeat(Math.min(15,floors))+'◇'}`;heading('Official result',won?'Swarm broken':'The crew fell',won?'One ally can carry the story onward.':`You cleared ${floors} rooms.`);const pre=el('pre',text,'paper');root.append(pre,countdownLine('Next run in')); const status=el('p','','muted');const bar=el('div',undefined,'bar');append(bar,btn('Copy result',async()=>{try{await navigator.clipboard.writeText(text);status.textContent='Copied.';}catch{status.textContent='Copy the result text above.';}}),btn('Camp',showCamp),btn('Title',showTitle,false,'primary'));root.append(bar,status);announce(won?'Run won.':'Run lost.');}
let checkingOpening = false, openingReady: Awaited<ReturnType<typeof openedRun>> = null, openingError = '';
async function checkOpening() {
  if (checkingOpening || openingReady) return;
  checkingOpening = true;
  try {
    const refreshed = await refreshRun(manifest, Date.now());
    if (refreshed.run) openingReady = { manifest: refreshed.manifest, run: refreshed.run };
    else manifest = refreshed.manifest;
    openingError = '';
  } catch (error) {
    try { openingReady = await openedRun(manifest, Date.now()); } catch { /* retry below */ }
    openingError = openingReady || (!(error instanceof RunOpeningError) && !openingDue(manifest, Date.now())) ? '' : 'The new run could not be loaded. Retrying shortly.';
  }
  finally { checkingOpening = false; }
  if (openingReady && (!save.today || save.today.result)) applyOpening();
  else showOpeningNotice();
}
function applyOpening() {
  if (!openingReady) return;
  cancelAnimationFrame(animation); combat = null; room = null;
  manifest = openingReady.manifest; run = openingReady.run; openingReady = null;
  save = rollover(save, manifest); persist(); selectedCamp = -1; loadArt(run.acts[0]); showTitle();
  announce('The new run is open.');
}
function showOpeningNotice() {
  let banner = document.querySelector<HTMLElement>('#opening-notice');
  if (!banner) { banner = el('div'); banner.id = 'opening-notice'; root.prepend(banner); }
  banner.replaceChildren();
  if (openingReady) append(banner, el('p', 'A new run is open. Switching ends your current attempt as a loss.'), btn('Switch to new run', () => { applyOpening(); banner?.remove(); }));
  else if (openingError) banner.append(el('p', openingError));
  else banner.remove();
}
async function boot(){try {manifest=await loadManifest();manifest=currentRun(manifest,Date.now());run=await loadRun(manifest);save=rollover(loadSave(),manifest);persist();loadArt(run.acts[0]);showTitle();setInterval(()=>{if (openingReady && (!save.today || save.today.result)) applyOpening(); else if (openingReady || openingError) { if (!document.querySelector('#opening-notice')) showOpeningNotice(); } else if (manifest.next && Date.parse(manifest.next.opensAt) <= Date.now()) void checkOpening(); for(const p of document.querySelectorAll<HTMLElement>('[data-countdown]'))p.textContent=openingReady ? 'The next run is open.' : openingError || countdownLineText(p.dataset.countdown!, manifest.nextOpensAt, Date.now());},1000);setInterval(()=>{void checkOpening();},30000);}catch(e){clear();heading('Unable to open the archive','Run unavailable');root.append(el('pre',e instanceof Error?e.message:String(e),'paper'));}}
void boot();
