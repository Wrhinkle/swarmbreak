import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkRun } from './run';
import type { Run } from './types';
const dev=JSON.parse(readFileSync(new URL('../public/runs/dev/run.json',import.meta.url),'utf8')) as Run;
describe('run validation',()=>{
 it('accepts the development run',()=>expect(checkRun(dev)).toEqual([]));
 it('reports unknown routines, missing creatures and bad node references',()=>{const r=structuredClone(dev);r.acts[0].creatures[0].routines.push('bad-routine');r.acts[0].nodes[0].encounter=['missing'];r.acts[0].nodes[0].next=['nowhere'];const errors=checkRun(r).join(' ');expect(errors).toContain('Unknown routine: bad-routine');expect(errors).toContain('Missing creature: missing');expect(errors).toContain('Bad node reference');});
 it('reports missing rewards and events',()=>{const r=structuredClone(dev);r.acts[0].nodes[0].reward='missing';r.acts[0].nodes[0].kind='event';r.acts[0].nodes[0].eventId='missing';const errors=checkRun(r).join(' ');expect(errors).toContain('Missing creature');expect(errors).toContain('Missing event');});
});
