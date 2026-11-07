import { describe,it,expect,vi } from 'vitest';
import { finishRun, importSave, loadSave, newSave, parseSave, rollover, writeSave } from './save';
import type { Save } from './save';
import { chooseAtb, createCombat, enableAtb, simulate, step } from './combat';
import type { Creature, Manifest } from './types';
const ally:Creature={id:'a',name:'Ally',blurb:'',sprite:'/a',bodyPlan:'beast',role:'bruiser',tier:'ally',routines:['strike'],source:'/'};
const manifest:Manifest={runId:'tomorrow',opensAt:'2026-01-01',nextOpensAt:'2026-01-02',runUrl:'/',voided:[]};
function playing():Save{return {...newSave(),today:{runId:'today',node:null,cleared:[],crew:[{creature:ally,hp:40,routines:['strike'],slots:3,recruited:true,active:true}],deck:['strike'],gold:0,seed:1,result:null}};}
describe('save',()=>{
 it('records an unfinished older run as a loss on rollover',()=>{const s=playing(),out=rollover(s,manifest);expect(out.today).toBeNull();expect(out.results.today).toBe('loss');expect(s.today).not.toBeNull();});
 it('keeps one recruited ally with the actual completion time',()=>{vi.useFakeTimers();try { vi.setSystemTime(new Date('2026-11-04T18:30:00Z')); const s=finishRun(playing(),'win',ally,['site']);expect(s.camp).toHaveLength(1);expect(importSave(JSON.stringify(s)).camp[0]).toMatchObject({ally,runId:'today',wonAt:'2026-11-04T18:30:00.000Z',sites:['site']}); } finally { vi.useRealTimers(); }});
 it('keeps none on a loss',()=>expect(finishRun(playing(),'loss',ally,[]).camp).toHaveLength(0));
 it('ignores a second result for the same run',()=>{const won=finishRun(playing(),'win',ally,[]);expect(finishRun(won,'loss',null,[])).toEqual(won);});
 it('rejects malformed imports',()=>{for(const s of ['no','{}','{"version":1,"camp":[],"results":{},"today":{}}'])expect(()=>importSave(s)).toThrow();});
 it('loads a paused ATB fight and an old idle fight',()=>{const s=playing();let fight=enableAtb(createCombat([{creature:ally}],[ally],1));while(!fight.atb?.pending) fight=step(fight);s.today!.combat=fight;expect(importSave(JSON.stringify(s)).today!.combat).toEqual(fight);delete fight.atb;s.today!.combat=fight;expect(importSave(JSON.stringify(s)).today!.combat).toEqual(fight);});
 it('resumes a targeted decision through a save with the same subsequent fight',()=>{
  const s=playing(); let fight=enableAtb(createCombat([{creature:ally}],[ally],1));
  while(!fight.atb?.pending) fight=step(fight);
  const paused=structuredClone(fight);
  fight=chooseAtb(fight,'c0','strike','e0'); s.today!.combat=fight;
  let loaded=parseSave(JSON.stringify(s)).today!.combat!;
  expect(loaded.atb?.choices).toEqual([{actorId:'c0',routineId:'strike',targetId:'e0'}]);
  let uninterrupted=chooseAtb(paused,'c0','strike','e0');
  while(!uninterrupted.result){
   uninterrupted=simulate(uninterrupted,3000); loaded=simulate(loaded,3000);
   expect(loaded).toEqual(uninterrupted);
   if(uninterrupted.atb?.pending){const actor=uninterrupted.atb.pending; uninterrupted=chooseAtb(uninterrupted,actor,'auto'); loaded=chooseAtb(loaded,actor,'auto');}
  }
 });
 it('rejects malformed saved ATB decisions',()=>{const s=playing();const fight=enableAtb(createCombat([{creature:ally}],[ally],1));s.today!.combat=fight;for(const bad of [{...fight.atb,cursor:-1},{...fight.atb,choices:'bad'},{...fight.atb,pending:'missing'},{...fight.atb,choice:'missing'}]){(s.today!.combat as unknown as {atb:unknown}).atb=bad;expect(()=>importSave(JSON.stringify(s))).toThrow('Invalid saved ATB');}});
 it('survives throwing storage',()=>{vi.stubGlobal('localStorage',{getItem(){throw Error('no');},setItem(){throw Error('no');}});const s=playing();expect(()=>writeSave(s)).not.toThrow();expect(loadSave()).toEqual(s);vi.unstubAllGlobals();});
});
describe('voided runs',()=>{
 const manifest={runId:'r',opensAt:'',nextOpensAt:'',runUrl:'',voided:['r']};
 it('returns a lost attempt once',()=>{const s=newSave();s.results.r='loss';const a=rollover(s,manifest);expect(a.results.r).toBeUndefined();a.results.r='loss';expect(rollover(a,manifest).results.r).toBe('loss');});
 it('leaves a win alone',()=>{const s=newSave();s.results.r='win';expect(rollover(s,manifest).results.r).toBe('win');});
});
