import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultTrip, tripSchema } from '../src/model.js';
import { isDate } from '../src/travel-data.js';
// This acceptance test calls the running app. It cannot substitute local CLI results.
const date = process.argv.find(a=>a.startsWith('--date='))?.slice(7);
if (!date || !isDate(date)) throw new Error('请提供可售期内日期：--date=YYYY-MM-DD');
const base = 'http://127.0.0.1:3088';
const report:{verified:boolean;createdAt:string;steps:unknown[]}={verified:false,createdAt:new Date().toISOString(),steps:[]};
async function post(path:string,body:unknown) {
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body),signal:AbortSignal.timeout(300_000)});
 const result=await response.json();
 if(!response.ok) throw new Error(`${path}: ${result.error?.code || result.code || response.status}`);
 return result;
}
function proof(value:any) {
 assert.equal(value?.engine,'bailian-managed-agent');
 assert.match(value.sessionId,/^sesn_/);assert.ok(value.eventIds.length>0);
 return value;
}
try {
 const status=await (await fetch(base+'/api/status')).json();
 assert.equal(status.engine,'bailian-managed-agent');assert.equal(status.travel,true);assert.equal(status.ai,true);
 const trip=defaultTrip(date);trip.members=trip.members.slice(0,2);trip.cities=['杭州'];
 const parsed=await post('/api/parse',{current:trip,text:'朋友 A 最早下午 14:00 出发，其他条件不变。'});
 assert.equal(tripSchema.parse(parsed.trip).members[1].earliestDeparture,'14:00');
 report.steps.push({task:'parse',execution:proof(parsed.execution)});
 const comparison=await post('/api/compare',{trip});
 assert.ok(comparison.plans.length>0);assert.equal(comparison.partial,false);
 comparison.execution.sessions.forEach(proof);
 report.steps.push({task:'compare',execution:comparison.execution,plans:comparison.plans});
 const changed=await post('/api/compare',{trip:parsed.trip});
 assert.equal(changed.trip.members[1].earliestDeparture,'14:00');
 report.steps.push({task:'changed',plans:changed.plans,exclusions:changed.exclusions});
 const impossible=structuredClone(trip);impossible.members.forEach(m=>m.budget=0);
 const empty=await post('/api/compare',{trip:impossible});
 assert.equal(empty.plans.length,0);
 report.steps.push({task:'no-feasible-plan',exclusions:empty.exclusions});
 const hotel=await post('/api/hotels',{city:'杭州',date});assert.ok(hotel.results.length>0);
 report.steps.push({task:'hotels',execution:proof(hotel.execution),count:hotel.results.length});
 const explanation=await post('/api/explain',{id:comparison.id});
 report.steps.push({task:'explain',execution:proof(explanation.execution)});
 report.verified=true;
} catch(error) {
 report.steps.push({failure:error instanceof Error?error.message:'验收未完成'});process.exitCode=1;
} finally {
 mkdirSync('evidence',{recursive:true});writeFileSync('evidence/managed-agent-acceptance.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({verified:report.verified,steps:report.steps.length,report:'evidence/managed-agent-acceptance.json'}));
}
