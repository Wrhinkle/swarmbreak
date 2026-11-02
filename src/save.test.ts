import { describe,it,expect,vi } from 'vitest';
import { finishRun, importSave, loadSave, newSave, rollover, writeSave } from './save';
import type { Save } from './save';
import type { Creature, Manifest } from './types';
const ally:Creature={id:'a',name:'Ally',blurb:'',sprite:'/a',bodyPlan:'beast',role:'bruiser',tier:'ally',routines:['strike'],source:'/'};
const manifest:Manifest={runId:'tomorrow',opensAt:'2026-01-01',nextOpensAt:'2026-01-02',runUrl:'/',voided:[]};
function playing():Save{return {...newSave(),today:{runId:'today',node:null,cleared:[],crew:[{creature:ally,hp:40,routines:['strike'],slots:3,recruited:true,active:true}],deck:['strike'],gold:0,seed:1,result:null}};}
describe('save',()=>{
 it('records an unfinished older run as a loss on rollover',()=>{const s=playing(),out=rollover(s,manifest);expect(out.today).toBeNull();expect(out.results.today).toBe('loss');expect(s.today).not.toBeNull();});
 it('keeps exactly one recruited ally on a win',()=>{const s=finishRun(playing(),'win',ally,'date',['site']);expect(s.camp).toHaveLength(1);expect(s.camp[0]).toMatchObject({ally,runId:'today',wonAt:'date',sites:['site']});});
 it('keeps none on a loss',()=>expect(finishRun(playing(),'loss',ally,'date',[]).camp).toHaveLength(0));
 it('ignores a second result for the same run',()=>{const won=finishRun(playing(),'win',ally,'date',[]);expect(finishRun(won,'loss',null,'date',[])).toEqual(won);});
 it('rejects malformed imports',()=>{for(const s of ['no','{}','{"version":1,"camp":[],"results":{},"today":{}}'])expect(()=>importSave(s)).toThrow();});
 it('survives throwing storage',()=>{vi.stubGlobal('localStorage',{getItem(){throw Error('no');},setItem(){throw Error('no');}});const s=playing();expect(()=>writeSave(s)).not.toThrow();expect(loadSave()).toEqual(s);vi.unstubAllGlobals();});
});
