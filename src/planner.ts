import { type Trip, type Member, type City, type Goal, nextDay } from './model.js';
import { dateTimeInShanghai, type TrainAudit, type TrainResult } from './travel-data.js';

export type Leg = Omit<TrainResult, 'price'> & { fareFen: number };
export type Journey = {
  memberId: string; name: string; origin: City; local: boolean;
  outbound: Leg | null; inbound: Leg | null;
  arrival: number; returnDeparture: number; fareFen: number; rideMinutes: number;
};
export type Plan = {
  id: string; city: City; goal: Goal; journeys: Journey[];
  totalFen: number; maxRideMinutes: number; totalRideMinutes: number;
  windowStart: number; windowEnd: number; togetherMinutes: number;
};
export type RouteData = { audit: TrainAudit; queriedAt: string; error?: string };
export type RouteMap = Record<string, RouteData>;
export type Exclusion = { city: City; member?: string; reason: string; kind: 'constraint' | 'data' };
export const routeKey = (origin: string, destination: string, date: string) => `${origin}|${destination}|${date}`;
const epoch = (date: string, clock: string) => dateTimeInShanghai(`${date} ${clock}:00`)!;

function leg(row: TrainResult): Leg | null {
  if (row.price.kind !== 'exact') return null;
  const { price, ...rest } = row;
  return { ...rest, fareFen: price.fen };
}

export function buildOptions(member: Member, city: City, trip: Trip, data: RouteMap): { options: Journey[]; reason?: string; kind?: 'constraint' | 'data' } {
  const earliest = epoch(trip.date, member.earliestDeparture);
  const latest = epoch(nextDay(trip.date), member.latestReturn);
  if (member.city === city) return { options: [{ memberId: member.id, name: member.name, origin: member.city, local: true, outbound: null, inbound: null, arrival: earliest, returnDeparture: latest, fareFen: 0, rideMinutes: 0 }] };
  const out = data[routeKey(member.city, city, trip.date)];
  const back = data[routeKey(city, member.city, nextDay(trip.date))];
  if (!out || !back || out.error || back.error || [out.audit.state, back.audit.state].some(s => s === 'invalid' || s === 'upstream_error')) return { options: [], kind: 'data', reason: '往返查询未能完整验证，请稍后重试' };
  if (out.audit.state === 'empty' || back.audit.state === 'empty') return { options: [], kind: 'data', reason: '当前搜索未返回完整往返车次；不代表所有车次均无票' };
  if (!out.audit.exactQuotes || !back.audit.exactQuotes) return { options: [], kind: 'data', reason: '票价脱敏或缺失，无法核对个人预算' };
  const outward = out.audit.results.map(leg).filter((x): x is Leg => !!x).filter(x =>
    dateTimeInShanghai(x.departure)! >= earliest && x.arrival.slice(0, 10) === trip.date);
  const returning = back.audit.results.map(leg).filter((x): x is Leg => !!x).filter(x =>
    dateTimeInShanghai(x.arrival)! <= latest && x.departure.slice(0, 10) === nextDay(trip.date));
  if (!outward.length || !returning.length) return { options: [], kind: 'constraint', reason: '已返回车次无法满足出发或回家时间；可调整时间后再查' };
  const timed: Journey[] = [];
  for (const a of outward) for (const b of returning) {
    const arrival = dateTimeInShanghai(a.arrival)!;
    const returnDeparture = dateTimeInShanghai(b.departure)!;
    if (returnDeparture <= arrival) continue;
    timed.push({ memberId: member.id, name: member.name, origin: member.city, local: false, outbound: a, inbound: b, arrival, returnDeparture, fareFen: a.fareFen + b.fareFen, rideMinutes: a.durationMinutes + b.durationMinutes });
  }
  const affordable = timed.filter(x => x.fareFen <= Math.round(member.budget * 100));
  if (!affordable.length) return { options: [], kind: 'constraint', reason: '已返回往返组合均超过个人交通预算' };
  const options = affordable.filter(x => x.rideMinutes <= member.maxRideHours * 60);
  if (!options.length) return { options: [], kind: 'constraint', reason: '已返回组合均超过个人往返乘车时长上限' };
  return { options };
}

function makePlan(city: City, goal: Goal, journeys: Journey[]): Plan {
  const start = Math.max(...journeys.map(x => x.arrival));
  const end = Math.min(...journeys.map(x => x.returnDeparture));
  return { id: `${city}-${goal}`, city, goal, journeys,
    totalFen: journeys.reduce((n, p) => n + p.fareFen, 0), maxRideMinutes: Math.max(...journeys.map(p => p.rideMinutes)),
    totalRideMinutes: journeys.reduce((n, p) => n + p.rideMinutes, 0), windowStart: start, windowEnd: end, togetherMinutes: (end - start) / 60000 };
}

export function comparePlans(a: Plan, b: Plan, goal: Goal) {
  if (goal === 'fair') return a.maxRideMinutes - b.maxRideMinutes || a.totalFen - b.totalFen || b.togetherMinutes - a.togetherMinutes || a.city.localeCompare(b.city);
  if (goal === 'cheap') return a.totalFen - b.totalFen || a.maxRideMinutes - b.maxRideMinutes || b.togetherMinutes - a.togetherMinutes || a.city.localeCompare(b.city);
  return b.togetherMinutes - a.togetherMinutes || a.totalFen - b.totalFen || a.maxRideMinutes - b.maxRideMinutes || a.city.localeCompare(b.city);
}

// Sweep possible latest arrivals instead of enumerating the cartesian product.
// Given a shared start, each person's options are independent. For minimax,
// establish the optimal maximum first, then minimize aggregate price under it.
export function solveCity(city: City, goal: Goal, all: Journey[][], minMinutes: number): Plan | null {
  const starts = [...new Set(all.flatMap(list => list.map(x => x.arrival)))].sort((a, b) => a - b);
  let best: Plan | null = null;
  for (const start of starts) {
    let eligible = all.map(list => list.filter(x => x.arrival <= start && x.returnDeparture >= start + minMinutes * 60000));
    if (eligible.some(list => !list.length)) continue;
    if (goal === 'fair') {
      const ceiling = Math.max(...eligible.map(list => Math.min(...list.map(x => x.rideMinutes))));
      eligible = eligible.map(list => list.filter(x => x.rideMinutes <= ceiling));
    }
    if (goal === 'together') {
      const end = Math.min(...eligible.map(list => Math.max(...list.map(x => x.returnDeparture))));
      eligible = eligible.map(list => list.filter(x => x.returnDeparture >= end));
    }
    const chosen = eligible.map(list => [...list].sort((a, b) => a.fareFen - b.fareFen || a.rideMinutes - b.rideMinutes || a.arrival - b.arrival || b.returnDeparture - a.returnDeparture)[0]);
    const candidate = makePlan(city, goal, chosen);
    if (!best || comparePlans(candidate, best, goal) < 0) best = candidate;
  }
  return best;
}

export function planTrip(trip: Trip, data: RouteMap) {
  const exclusions: Exclusion[] = [];
  const candidates: Plan[] = [];
  for (const city of trip.cities) {
    const all = trip.members.map(member => {
      const result = buildOptions(member, city, trip, data);
      if (!result.options.length) exclusions.push({ city, member: member.name, reason: result.reason!, kind: result.kind! });
      return result.options;
    });
    if (all.some(list => !list.length)) continue;
    const plans = (['fair', 'cheap', 'together'] as const).map(goal => solveCity(city, goal, all, trip.minTogetherHours * 60)).filter((p): p is Plan => !!p);
    if (!plans.length) exclusions.push({ city, kind: 'constraint', reason: '无法满足全组最短共同停留窗口' });
    candidates.push(...plans);
  }
  const plans = (['fair', 'cheap', 'together'] as const).flatMap(goal => {
    const sorted = candidates.filter(p => p.goal === goal).sort((a, b) => comparePlans(a, b, goal));
    return sorted.length ? [sorted[0]] : [];
  });
  return { plans, exclusions, feasibleCities: [...new Set(candidates.map(x => x.city))] };
}
