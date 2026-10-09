import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalRoute } from '../src/local-service.js';
import { rankLocalPlans, type LocalPlan } from '../src/local-model.js';
import { tripSchema, defaultTrip } from '../src/model.js';
test('same-city routes use provider duration, never a zero inferred from city equality',()=>{
 const payload={status:'1',route:{transits:[{duration:'3720',cost:'6',segments:[{bus:{buslines:[{name:'地铁10号线'}]}}]}]}};
 assert.deepEqual(parseLocalRoute(payload,'transit'),{minutes:62,distance:null,fareFen:600,steps:['地铁10号线']});
 for(const duration of [undefined,'',null,'bad','0','-10'])assert.equal(parseLocalRoute({status:'1',route:{transits:[{duration}]}},'transit'),null);
 assert.equal(parseLocalRoute({status:'0',route:{transits:[{duration:'30'}]}},'transit'),null);
});
test('driving quotes never reinterpret toll cost as full trip fare',()=>{
 const r=parseLocalRoute({status:'1',route:{paths:[{duration:'2400',distance:'21000',cost:'5'}]}},'driving');assert.equal(r?.minutes,40);assert.equal(r?.fareFen,null);
});
test('fairness minimizes longest individual journey then total time',()=>{
 const input=[{maxMinutes:60,totalMinutes:70},{maxMinutes:50,totalMinutes:100},{maxMinutes:50,totalMinutes:90}] as LocalPlan[];
 assert.equal(rankLocalPlans(input)[0],input[2]);assert.equal(input[0].maxMinutes,60);
});
test('national trip schema accepts out-of-region cities without expanding the default batch',()=>{
 const t=defaultTrip('2026-10-10');t.members[0].city='广州';t.members[1].city='深圳';t.cities=['东莞'];assert.equal(tripSchema.safeParse(t).success,true);assert.equal(defaultTrip().cities.length,1);
});
