import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveCity, buildOptions, planTrip, routeKey, type Journey, type Plan, type RouteMap } from '../src/planner.js';
import { defaultTrip, type Goal } from '../src/model.js';
import { auditTrains } from '../src/travel-data.js';

function option(name: string, cost: number, duration: number, arrival: number, departure: number): Journey {
  return { memberId: name, name, origin: '上海', local: false, outbound: null, inbound: null, fareFen: cost, rideMinutes: duration, arrival: arrival * 60000, returnDeparture: departure * 60000 };
}
function score(journeys: Journey[], goal: Goal) {
  const cost = journeys.reduce((n, p) => n + p.fareFen, 0);
  const longest = Math.max(...journeys.map(p => p.rideMinutes));
  const together = (Math.min(...journeys.map(p => p.returnDeparture)) - Math.max(...journeys.map(p => p.arrival))) / 60000;
  return goal === 'fair' ? [longest, cost] : goal === 'cheap' ? [cost, longest] : [-together, cost];
}
function cartesian(lists: Journey[][]): Journey[][] { return lists.reduce<Journey[][]>((combos, list) => combos.flatMap(c => list.map(v => [...c, v])), [[]]); }

test('公平目标不是简单地为每人选最快车次：先最小化最坏值再总费用', () => {
  const a = [option('a', 9000, 60, 600, 2100), option('a', 1000, 120, 600, 2100)];
  const b = [option('b', 2000, 150, 660, 2100)];
  const fair = solveCity('杭州', 'fair', [a, b], 600)!;
  assert.equal(fair.maxRideMinutes, 150);
  assert.equal(fair.totalFen, 3000);
});
test('共同窗口必须是全员交集，不能把各人停留时间相加', () => {
  const all = [[option('a', 1000, 90, 600, 1800)], [option('b', 1000, 90, 1000, 2000)]];
  assert.equal(solveCity('杭州', 'together', all, 600)?.togetherMinutes, 800);
  assert.equal(solveCity('杭州', 'together', all, 900), null);
});
test('三种目标与小规模穷举结果对照，200组可重现数据', () => {
  let seed = 839;
  const rand = (n: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 200; trial++) {
    const lists = Array.from({ length: 2 + rand(3) }, (_, m) => Array.from({ length: 1 + rand(4) }, () => option(String(m), 100 + rand(9) * 100, 60 + rand(6) * 30, 500 + rand(10) * 50, 1700 + rand(10) * 50)));
    const minimum = 900;
    const feasible = cartesian(lists).filter(xs => (Math.min(...xs.map(p => p.returnDeparture)) - Math.max(...xs.map(p => p.arrival))) / 60000 >= minimum);
    for (const goal of ['fair', 'cheap', 'together'] as const) {
      const actual = solveCity('杭州', goal, lists, minimum);
      const ranked = feasible.map(xs => score(xs, goal)).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
      if (!ranked.length) assert.equal(actual, null);
      else { assert.ok(actual); assert.deepEqual(score(actual.journeys, goal), ranked[0], `${goal}, trial ${trial}`); }
    }
  }
});

function data(): RouteMap {
  const make = (origin: '上海' | '杭州', destination: '上海' | '杭州', date: string, departure: string, arrival: string) => auditTrains({ status: 0, data: { itemList: [{ price: '100.50', jumpUrl: 'https://router.feizhu.com/unit-test', journeys: [{ segments: [{ depCityName: origin, arrCityName: destination, depDateTime: `${date} ${departure}:00`, arrDateTime: `${date} ${arrival}:00`, depStationName: origin + '站', arrStationName: destination + '站', marketingTransportNo: 'TEST-ONLY', seatClassName: '二等座' }] }] }] } }, { origin, destination, date });
  return { [routeKey('上海','杭州','2026-10-10')]: { audit: make('上海','杭州','2026-10-10','10:00','11:00'), queriedAt: '' },
    [routeKey('杭州','上海','2026-10-11')]: { audit: make('杭州','上海','2026-10-11','17:00','18:00'), queriedAt: '' } };
}
test('每人的往返预算、时间和时长是硬限制', () => {
  const trip = defaultTrip('2026-10-10');
  const member = trip.members[0];
  assert.equal(buildOptions(member, '杭州', trip, data()).options.length, 1);
  assert.equal(buildOptions({ ...member, budget: 200 }, '杭州', trip, data()).options.length, 0);
  assert.equal(buildOptions({ ...member, earliestDeparture: '10:01' }, '杭州', trip, data()).options.length, 0);
  assert.equal(buildOptions({ ...member, latestReturn: '17:59' }, '杭州', trip, data()).options.length, 0);
  assert.equal(buildOptions({ ...member, maxRideHours: 1.99 }, '杭州', trip, data()).options.length, 0);
});
test('本地成员的零铁路费用是推导值，不伪造车次', () => {
  const trip = defaultTrip('2026-10-10');
  const [local] = buildOptions(trip.members[0], '上海', trip, {}).options;
  assert.equal(local.local, true); assert.equal(local.fareFen, 0); assert.equal(local.outbound, null);
});
test('条件改变重新计算后，旧方案不再保留', () => {
  const trip = defaultTrip('2026-10-10');
  trip.members = [trip.members[0], { ...trip.members[1], city: '杭州' }]; trip.cities = ['杭州'];
  assert.equal(planTrip(trip, data()).plans.length, 3);
  trip.members[0].budget = 10;
  const changed = planTrip(trip, data());
  assert.equal(changed.plans.length, 0);
  assert.ok(changed.exclusions.some(e => e.kind === 'constraint' && e.reason.includes('预算')));
});
test('缺少报价时不能生成可行预算方案', () => {
  const trip = defaultTrip('2026-10-10');
  const routes = data();
  routes[routeKey('上海','杭州','2026-10-10')].audit.results[0].price = { kind: 'masked', raw: '1xx' };
  routes[routeKey('上海','杭州','2026-10-10')].audit.exactQuotes = 0;
  const result = buildOptions(trip.members[0], '杭州', trip, routes);
  assert.equal(result.options.length, 0); assert.equal(result.kind, 'data');
});
