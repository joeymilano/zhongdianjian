import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTrip} from '../src/model.js';
import {applyIntentPatch} from '../src/intent-patch.js';
test('changing one departure preserves every unrelated confirmed field',()=>{
 const current=defaultTrip('2026-10-10');
 const {trip}=applyIntentPatch(current,{memberUpdates:[{id:'m2',earliestDeparture:'14:00'}],questions:[]});
 const expected=structuredClone(current);expected.members[1].earliestDeparture='14:00';
 assert.deepEqual(trip,expected);assert.equal(current.members[1].earliestDeparture,'09:00');
});
test('unknown members, invented fields and invalid budgets cannot overwrite the form',()=>{
 const trip=defaultTrip('2026-10-10');
 for(const raw of [{memberUpdates:[{id:'other',budget:20}]},{memberUpdates:[{id:'m1',budget:-1}]},{memberUpdates:[{id:'m1',from:'南京'}]},{updates:{date:'tomorrow'}},{removeMemberIds:['m1','m2']}]) assert.throws(()=>applyIntentPatch(trip,raw));
});
test('ambiguous reference returns questions without fabricating a change',()=>{
 const trip=defaultTrip('2026-10-10');
 const p=applyIntentPatch(trip,{questions:['她指的是哪位朋友？']});
 assert.deepEqual(p.trip,trip);assert.equal(p.questions.length,1);
});
test('explicit friend name cannot silently modify another member',()=>{
 const trip=defaultTrip('2026-10-10');
 assert.throws(()=>applyIntentPatch(trip,{memberUpdates:[{id:'m1',earliestDeparture:'14:00'}]},'朋友 A 最早下午14:00出发'));
 assert.equal(applyIntentPatch(trip,{memberUpdates:[{id:'m2',earliestDeparture:'14:00'}]},'朋友A最早下午14:00出发').trip.members[1].earliestDeparture,'14:00');
});
