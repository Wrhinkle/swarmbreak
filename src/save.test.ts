import { describe,it,expect,vi } from 'vitest';
import { currentRun, finishRun, importSave, loadSave, newSave, rollover, writeSave } from './save';
import type { Save } from './save';
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
