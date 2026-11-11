import { describe,it,expect,vi } from 'vitest';
import { currentRun, finishRun, importSave, loadSave, newSave, rollover, writeSave } from './save';
import type { Save } from './save';
import { parseSave as parseReleasedSave } from './legacy-save.fixture';
import type { Creature, Manifest } from './types';
const ally:Creature={id:'a',name:'Ally',blurb:'',sprite:'/a',bodyPlan:'beast',role:'bruiser',tier:'ally',routines:['strike'],source:'/'};
const manifest:Manifest={runId:'tomorrow',opensAt:'2026-01-01',nextOpensAt:'2026-01-02',runUrl:'/',voided:[]};
function playing():Save{return {...newSave(),today:{runId:'today',node:null,cleared:[],crew:[{creature:ally,hp:40,routines:['strike'],slots:3,recruited:true,active:true}],deck:['strike'],gold:0,seed:1,result:null}};}
describe('save',()=>{
 it('migrates a released save with the walkthrough unseen',()=>{expect(importSave(JSON.stringify({version:1,camp:[],today:null,results:{}}))).toMatchObject({version:2,walkthroughSeen:false});});
 it('persists a completed walkthrough and rejects invalid version 2 flags',()=>{const s=newSave();s.walkthroughSeen=true;expect(importSave(JSON.stringify(s)).walkthroughSeen).toBe(true);expect(()=>importSave(JSON.stringify({...s,walkthroughSeen:'yes'}))).toThrow();});
 it('records an unfinished older run as a loss on rollover',()=>{const s=playing(),out=rollover(s,manifest);expect(out.today).toBeNull();expect(out.results.today).toBe('loss');expect(s.today).not.toBeNull();});
 it('keeps one recruited ally with the actual completion time',()=>{vi.useFakeTimers();try { vi.setSystemTime(new Date('2026-11-04T18:30:00Z')); const s=finishRun(playing(),'win',ally,['site']);expect(s.camp).toHaveLength(1);expect(importSave(JSON.stringify(s)).camp[0]).toMatchObject({ally,runId:'today',wonAt:'2026-11-04T18:30:00.000Z',sites:['site']}); } finally { vi.useRealTimers(); }});
 it('keeps none on a loss',()=>expect(finishRun(playing(),'loss',ally,[]).camp).toHaveLength(0));
 it('ignores a second result for the same run',()=>{const won=finishRun(playing(),'win',ally,[]);expect(finishRun(won,'loss',null,[])).toEqual(won);});
 it('rejects malformed imports',()=>{for(const s of ['no','{}','{"version":1,"camp":[],"results":{},"today":{}}'])expect(()=>importSave(s)).toThrow();});
 it('preserves progress through a rollback to the released version',()=>{
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>data.set(key,value)});
  try {
   const original=playing(); original.walkthroughSeen=true; original.camp=[{ally,runId:'earlier',wonAt:'2026-01-01',sites:['site']}]; original.results.earlier='win';
   writeSave(original);
   // The released parser accepts only version 1 and returns the parsed object;
   // its persistence writes that object back to the same key.
   const oldSave=parseReleasedSave(data.get('swarmbreak-save-v1')!);
   expect(oldSave.version).toBe(1);
   expect(oldSave).not.toHaveProperty('walkthroughSeen');
   oldSave.camp.push({ally,runId:'rollback',wonAt:'2026-01-02',sites:['other']});
   oldSave.today!.gold=25; oldSave.today!.cleared.push('room'); oldSave.results.rollback='loss';
   data.set('swarmbreak-save-v1',JSON.stringify(oldSave));
   const restored=loadSave();
   expect(restored).toMatchObject({version:2,walkthroughSeen:true,camp:oldSave.camp,today:oldSave.today,results:oldSave.results});
   writeSave(restored);
   expect(loadSave()).toEqual(restored);
  } finally { vi.unstubAllGlobals(); }
 });
 it('migrates a previously stored version 2 save before writing the compatible format',()=>{
  const data = new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>data.set(key,value)});
  try {
   const existing=playing(); existing.walkthroughSeen=true; existing.results.earlier='win'; existing.camp=[{ally,runId:'earlier',wonAt:'2026-01-01',sites:['site']}];
   data.set('swarmbreak-save-v1',JSON.stringify(existing));
   data.set('swarmbreak-save-v2',JSON.stringify({walkthroughSeen:false}));
   expect(loadSave()).toEqual(existing);
   writeSave(loadSave());
   expect(JSON.parse(data.get('swarmbreak-save-v1')!).version).toBe(1);
   expect(loadSave()).toEqual(existing);
  } finally { vi.unstubAllGlobals(); }
 });
 it('survives throwing storage',()=>{vi.stubGlobal('localStorage',{getItem(){throw Error('no');},setItem(){throw Error('no');}});const s=playing();expect(()=>writeSave(s)).not.toThrow();expect(loadSave()).toEqual(s);vi.unstubAllGlobals();});
});
describe('voided runs',()=>{
 const manifest={runId:'r',opensAt:'',nextOpensAt:'',runUrl:'',voided:['r']};
 it('returns a lost attempt once',()=>{const s=newSave();s.results.r='loss';const a=rollover(s,manifest);expect(a.results.r).toBeUndefined();a.results.r='loss';expect(rollover(a,manifest).results.r).toBe('loss');});
 it('leaves a win alone',()=>{const s=newSave();s.results.r='win';expect(rollover(s,manifest).results.r).toBe('win');});
});

describe('prebuilt next run', () => {
  const m = { runId: 'a', opensAt: '2026-11-09T13:00:00Z', nextOpensAt: '2026-11-10T13:00:00Z', runUrl: '/runs/a/run.json', voided: [], next: { runId: 'b', opensAt: '2026-11-10T13:00:00Z', runUrl: '/runs/b/run.json' } };
  it('keeps today until the next run opens', () => { expect(currentRun(m, Date.parse('2026-11-10T12:59:59Z')).runId).toBe('a'); });
  it('switches to the next run at its time with a 24h countdown', () => {
    const c = currentRun(m, Date.parse('2026-11-10T13:00:00Z'));
    expect(c).toEqual({ runId: 'b', opensAt: '2026-11-10T13:00:00Z', nextOpensAt: '2026-11-11T13:00:00Z', runUrl: '/runs/b/run.json', voided: [] });
  });
});
