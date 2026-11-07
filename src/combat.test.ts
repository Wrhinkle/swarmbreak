import { describe, it, expect } from 'vitest';
import { atbTargets, chooseAtb, condition, createCombat, enableAtb, fighter, setAutoBattle, simulate, step } from './combat';
import { ROUTINES } from './library';
import type { ActionId, ConditionId, Routine } from './library';
import type { Creature } from './types';
const c = (id:string, routines=['strike']):Creature => ({id,name:id,blurb:'',sprite:'',bodyPlan:'construct',role:'bruiser',tier:'ally',routines,source:'/'});
const routine = (condition:ConditionId, action:ActionId='strike', arg?:number):Routine => ({id:'test',name:'test',condition,action,price:0,arg});
describe('combat',()=>{
 it('lets a player target the attack used after a summon or split is exhausted',()=>{
  for (const id of ['spawn','divide']) {
   const initial=createCombat([{creature:c('a',[id])}],[c('e'),c('f')],42);
   initial.fighters[0].nextAction=1; initial.fighters[0].summons=2; initial.fighters[0].splitDone=true;
   initial.fighters.slice(1).forEach(f=>f.nextAction=100);
   const waiting=step(enableAtb(initial));
   expect(atbTargets(waiting,'c0',id).map(f=>f.id)).toEqual(['e0','e1']);
   const result=step(chooseAtb(waiting,'c0',id,'e1'));
   expect(result.fighters[1].hp).toBe(initial.fighters[1].hp);
   expect(result.fighters[2].hp).toBeLessThan(initial.fighters[2].hp);
  }
 });
 it('executes a manually selected routine instead of a previously charged attack',()=>{
  const initial=createCombat([{creature:c('a',['charge','brace','patch'])}],[c('e')],42);
  initial.fighters[0].charging=true; initial.fighters[0].nextAction=1; initial.fighters[1].nextAction=100;
  const waiting=step(enableAtb(initial));
  expect(atbTargets(waiting,'c0','patch').map(f=>f.id)).toEqual(['c0']);
  const result=step(chooseAtb(waiting,'c0','brace'));
  expect(result.events.find(e=>e.kind==='action')?.routine).toBe('brace');
  expect(result.fighters[0].shield).toBeGreaterThan(0);
  expect(result.fighters[0].charging).toBe(false);
 });
 it('records and applies a valid manual target after serialization',()=>{
  const initial=createCombat([{creature:c('a',['strike','patch'])},{creature:c('b')}],[c('e'),c('f')],42);
  initial.fighters[0].nextAction=1; initial.fighters.slice(1).forEach(f=>f.nextAction=100);
  const paused=step(enableAtb(initial));
  expect(atbTargets(paused,'c0','strike').map(f=>f.id)).toEqual(['e0','e1']);
  expect(atbTargets(paused,'c0','patch').map(f=>f.id)).toEqual(['c0','c1']);
  expect(chooseAtb(paused,'c0','strike','c1')).toEqual(paused);
  const chosen=chooseAtb(paused,'c0','strike','e1');
  expect(chosen.atb?.choices).toEqual([{actorId:'c0',routineId:'strike',targetId:'e1'}]);
  const resumed=step(JSON.parse(JSON.stringify(chosen)));
  expect(resumed).toEqual(step(chosen));
  expect(resumed.fighters[2].hp).toBe(initial.fighters[2].hp);
  expect(resumed.fighters[3].hp).toBeLessThan(initial.fighters[3].hp);
 });
 it('pauses at each ready crew decision and resumes a serialized tick deterministically',()=>{
  const initial=createCombat([{creature:c('a')},{creature:c('b')}],[c('e')],42); initial.fighters.forEach(f=>f.nextAction=1);
  const paused=step(enableAtb(initial)); expect(paused.atb?.pending).toBe('c0'); expect(paused.events).toHaveLength(0);
  expect(step(paused)).toEqual(paused);
  const resolve=(s:typeof paused)=>{ while(s.atb?.pending) s=step(chooseAtb(s,s.atb.pending,'auto')); return s; };
  const resumed=resolve(JSON.parse(JSON.stringify(paused))); const repeat=resolve(paused);
  expect(resumed).toEqual(repeat); expect(resumed.atb?.choices.map(x=>x.actorId)).toEqual(['c0','c1']);
  const {atb: _atb,...actual}=resumed; expect(actual).toEqual(step(initial));
 });
 it('does not ask for an action after the last enemy falls mid-tick',()=>{
  const initial=createCombat([{creature:c('a')},{creature:c('b')}],[c('e')],42);
  initial.fighters.forEach(f=>f.nextAction=1); initial.fighters[2].hp=1;
  const first=step(enableAtb(initial));
  const finished=step(chooseAtb(first,'c0','strike','e0'));
  expect(finished.result).toBe('win'); expect(finished.atb?.pending).toBeNull();
  const {atb: _atb,...automaticFields}=finished; expect(automaticFields).toEqual(step(initial));
 });
 it('enabling auto battle resolves and records a waiting decision across reload',()=>{
  const initial=createCombat([{creature:c('a')}],[c('e')],7); initial.fighters[0].nextAction=1;
  const waiting=step(enableAtb(initial)); const automatic=setAutoBattle(waiting,true);
  expect(waiting.atb?.pending).toBe('c0'); expect(automatic.atb?.pending).toBeNull();
  expect(automatic.atb?.choices).toEqual([{actorId:'c0',routineId:'auto'}]);
  expect(step(JSON.parse(JSON.stringify(automatic)))).toEqual(step(automatic));
  expect(simulate(automatic,3000).atb?.pending).toBeNull();
 });
 it('auto battle follows the existing fight without pausing',()=>{
  const initial=createCombat([{creature:c('a',['sweep','strike'])}],[c('e'),c('f')],3);
  const auto=simulate(enableAtb(initial,true),3000); const {atb,...actual}=auto;
  expect(atb?.pending).toBeNull(); expect(actual).toEqual(simulate(initial,3000));
 });
 it('repeats the same event log for the same seed',()=>{const make=()=>simulate(createCombat([{creature:c('a',['sweep','strike'])}],[c('b'),c('c')],123),3000);expect(make()).toEqual(make());});
 it('evaluates all conditions',()=>{const s=createCombat([{creature:c('a')},{creature:c('b')}],[c('e'),c('f')],1),[a,b,e]=s.fighters;a.hp=5;a.shield=0;a.corrupted=4;b.hp=0;e.shield=1;e.hp=4;const yes: [ConditionId,number?][]=[['always'],['self_hp_below',.5],['ally_hp_below',.5],['ally_down'],['self_unshielded'],['foe_shielded'],['foe_hp_below',.5],['foes_at_least',2],['self_corrupted']];for(const [id,arg] of yes)expect(condition(s,a,routine(id,'strike',arg)),id).toBe(true);expect(condition(s,a,routine('foes_at_least','strike',3))).toBe(false);});
 it('runs each action and every library routine',()=>{const actions:ActionId[]=['strike','heavy','sweep','overflow','patch','mend_all','guard_self','guard_ally','corrupt','purge','stun','summon','split','steal','mirror','charge'];for(const action of actions){const id=`test_${action}`;ROUTINES[id]=routine('always',action);ROUTINES[id].id=id;const s=createCombat([{creature:c('a',[id])}],[c('e')],1);s.fighters[0].hp=10;s.fighters[0].corrupted=8;s.fighters[0].lastAction='heavy';expect(()=>simulate(s,30),action).not.toThrow();delete ROUTINES[id];} for(const id of Object.keys(ROUTINES))expect(()=>simulate(createCombat([{creature:c('a',[id])}],[c('e')],2),60),id).not.toThrow();});
 it('applies the effects of each action',()=>{
  const expected:Record<ActionId,string>={strike:'damage',heavy:'damage',sweep:'damage',overflow:'damage',patch:'heal',mend_all:'heal',guard_self:'shield',guard_ally:'shield',corrupt:'corrupt',purge:'purge',stun:'stun',summon:'summon',split:'split',steal:'steal',mirror:'damage',charge:'charge'};
  for(const [action,kind] of Object.entries(expected) as [ActionId,string][]){const id=`case_${action}`;ROUTINES[id]={...routine('always',action),id};const s=createCombat([{creature:c('a',[id])}],[c('e')],7);const a=s.fighters[0];a.nextAction=1;a.hp=10;a.corrupted=8;a.lastAction='heavy';s.fighters[1].nextAction=100;const out=simulate(s,1);expect(out.events.some(e=>e.kind===kind),action).toBe(true);delete ROUTINES[id];}
 });
 it('handles shield breaking, corruption, stun, and a charged hit',()=>{
  const s=createCombat([{creature:c('a',['breach'])}],[c('e')],1);s.fighters[0].nextAction=1;s.fighters[1].nextAction=100;s.fighters[1].shield=20;const breach=step(s);expect(breach.fighters[1].shield).toBe(0);expect(breach.fighters[1].hp).toBe(s.fighters[1].hp-11);
  const afflicted=createCombat([{creature:c('a')}],[c('e')],1);afflicted.fighters[0].corrupted=24;afflicted.fighters[0].shield=10;afflicted.fighters[0].stunned=true;afflicted.fighters[0].nextAction=1;const tick=step(afflicted);expect(tick.fighters[0].hp).toBe(afflicted.fighters[0].hp-1);expect(tick.fighters[0].shield).toBe(10);expect(tick.events.some(e=>e.kind==='stunned')).toBe(true);
  const charging=createCombat([{creature:c('a',['charge'])}],[c('e')],1);charging.fighters[0].nextAction=1;charging.fighters[1].nextAction=100;const charged=simulate(charging,9);expect(charged.events.some(e=>e.kind==='charge')).toBe(true);expect(charged.fighters[1].hp).toBe(charging.fighters[1].hp-21);
 });
 it('absorbs damage with shield before HP',()=>{const s=createCombat([{creature:c('a')}],[c('e')],1);s.fighters[1].shield=10;s.fighters[1].nextAction=99;const out=simulate(s,8);expect(out.fighters[1].hp).toBe(s.fighters[1].hp);expect(out.fighters[1].shield).toBe(3);});
 it('caps summons and split copies',()=>{for(const id of ['spawn','divide']){const s=createCombat([{creature:c('a',[id])}],[c('e',['brace'])],1);s.fighters[0].hp=10;s.fighters[0].power=0;s.fighters[1].power=0;const out=simulate(s,100);expect(out.fighters.filter(f=>f.summonedBy==='c0').length).toBeLessThanOrEqual(id==='spawn'?2:1);}});
 it('times out at 3000 ticks as a loss',()=>{const s=createCombat([{creature:c('a',['brace'])}],[c('e',['brace'])],1);s.fighters.forEach(f=>f.power=0);const out=simulate(s,3100);expect(out.t).toBe(3000);expect(out.result).toBe('loss');});
 it('ignores legacy queued orders and cooldown when resolving an ATB action',()=>{
  const s=createCombat([{creature:c('a',['strike','brace'])}],[c('e')],1);s.fighters[0].nextAction=1;s.fighters[1].nextAction=100;s.queued={actorId:'c0',routineId:'brace'};s.cooldown=20;
  const waiting=step(enableAtb(s));const result=step(chooseAtb(waiting,'c0','strike','e0'));
  expect(result.events.find(e=>e.kind==='action')?.routine).toBe('strike');expect(result.fighters[1].hp).toBeLessThan(s.fighters[1].hp);
 });
 it('does not mutate input on a step',()=>{const s=createCombat([{creature:c('a')}],[c('b')],1), before=structuredClone(s);step(s);expect(s).toEqual(before);expect(fighter(c('a'),'crew','x').hp).toBeGreaterThan(0);});
});
describe('review findings',()=>{
 it('a boss with jam first still deals damage',()=>{const s=createCombat([{creature:c('a',['brace'])}],[c('e',['jam','strike'])],1);const out=simulate(s,60);expect(out.fighters[0].hp).toBeLessThan(s.fighters[0].hp);});
 it('heals the most wounded ally by fraction',()=>{const s=createCombat([{creature:{...c('a',['patch']),role:'healer'}},{creature:c('b')}],[c('e')],1);s.fighters[0].hp=30;s.fighters[0].maxHp=30;s.fighters[1].hp=35;s.fighters[1].maxHp=48;s.fighters[0].nextAction=1;s.fighters[2].nextAction=99;ROUTINES.patch.arg=.8;const out=step(s);ROUTINES.patch.arg=.5;expect(out.fighters[1].hp).toBeGreaterThan(35);});
 it('a stun breaks a charge',()=>{const s=createCombat([{creature:c('a')}],[c('e')],1);s.fighters[1].charging=true;s.fighters[1].stunned=true;s.fighters[1].nextAction=1;s.fighters[0].nextAction=99;expect(step(s).fighters[1].charging).toBe(false);});
});
