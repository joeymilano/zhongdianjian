import { managedTrains, managedHotels, trainCommand, type AgentProof } from './managed-travel.js';
import { agentConfig } from './managed-agent.js';
import { AppError } from './limits.js';
import { auditTrains, object, parsePrice, bookingUrl, type RouteQuery } from './travel-data.js';
import { planTrip, routeKey, type RouteData, type RouteMap } from './planner.js';
import { nextDay, type Trip, type City } from './model.js';
import { runtimeStore } from './runtime-store.js';
import { randomUUID } from 'node:crypto';

type CloudRoute = RouteData & { proof?: AgentProof };
type Cached = { expires: number; data: CloudRoute };
type Store = { cache: Map<string, Cached>; running: boolean; comparisons: Map<string, { expires: number; result: Comparison }> };
const globalStore = globalThis as typeof globalThis & { zhongdianTravel?: Store };
const store = globalStore.zhongdianTravel ??= { cache: new Map(), running: false, comparisons: new Map() };
const TTL = 300_000;
const emptyAudit = () => auditTrains(null, { origin: '上海', destination: '杭州', date: '2000-01-01' });

export async function compareTrip(trip: Trip, refresh = false) {
  agentConfig(true);
  if (store.running) throw new AppError('BUSY', '已有一次方案查询正在进行，请稍候', 429);
  store.running = true;
  try {
    const unique = new Map<string, RouteQuery>();
    for (const city of trip.cities) for (const member of trip.members) {
      if (city === member.city) continue;
      for (const q of [{ origin: member.city, destination: city, date: trip.date }, { origin: city, destination: member.city, date: nextDay(trip.date) }]) unique.set(routeKey(q.origin, q.destination, q.date), q);
    }
    const data: RouteMap = {};
    const queue = [...unique.values()];
    const missing: RouteQuery[] = [];
    const proofs: AgentProof[] = [];
    const warnings: string[] = [];
    for (const query of queue) {
      const key = routeKey(query.origin, query.destination, query.date);
      const cached = store.cache.get(key);
      if (!refresh && cached && cached.expires > Date.now()) {
        data[key] = cached.data;
        if (cached.data.proof) proofs.push(cached.data.proof);
      } else missing.push(query);
    }
    if (missing.length) {
      const cloud = await managedTrains(missing);
      proofs.push(cloud.proof);
      if (cloud.warning) warnings.push(cloud.warning.message);
      for (const query of missing) {
        const key = routeKey(query.origin,query.destination,query.date);
        const result = cloud.results.get(trainCommand(query));
        if (!result) { data[key] = {audit:emptyAudit(),queriedAt:new Date().toISOString(),error:'云端未返回该路线的工具记录'}; continue; }
        const value: CloudRoute = {audit:auditTrains(result.payload,query),queriedAt:result.queriedAt,proof:{...cloud.proof,eventIds:[result.eventId]}};
        data[key] = value;
        if (['usable','partial','empty','masked'].includes(value.audit.state)) {
          if (store.cache.size > 500) store.cache.clear();
          store.cache.set(key,{expires:Date.parse(result.queriedAt)+TTL,data:value});
        }
      }
    }
    // A cached route may expire while another cloud route is still running.
    for (const [key,value] of Object.entries(data)) {
      if (Date.parse(value.queriedAt) + TTL <= Date.now() || Date.parse(value.queriedAt) > Date.now() + 60_000) {
        data[key] = {...value,audit:emptyAudit(),error:'该路线报价已过期，请刷新后比较'};
      }
    }
    const result = planTrip(trip, data);
    const timestamps = Object.values(data).map(x => x.queriedAt).sort();
    const oldestQuote = timestamps[0] || new Date().toISOString();
    const response: Comparison = { ...result, id: randomUUID(), trip, queriedAt: new Date().toISOString(), oldestQuote,
      expiresAt: new Date(Date.parse(oldestQuote) + TTL).toISOString(), source: '飞猪 FlyAI · 百炼 Managed Agent',
      execution: {engine:'bailian-managed-agent',sessions:[...new Map(proofs.map(p=>[p.sessionId,p])).values()]},
      searchedRoutes: Object.keys(data).length,
      partial: Object.keys(data).length < queue.length || Object.values(data).some(x => x.error || x.audit.state !== 'usable'),
      platformHints: [...new Set([...warnings, ...Object.values(data).map(x => x.audit.platformHint).filter(Boolean)])],
    };
    for (const [id, record] of store.comparisons) if (record.expires < Date.now()) store.comparisons.delete(id);
    if (store.comparisons.size >= 30) store.comparisons.delete(store.comparisons.keys().next().value!);
    store.comparisons.set(response.id, { result: response, expires: Date.now() + 600_000 });
    await runtimeStore.getStore()?.saveComparison(response.id, response);
    return response;
  } finally { store.running = false; }
}

export async function hotels(city: City, date: string) {
  agentConfig(true);
  const {payload,proof,queriedAt} = await managedHotels(city, date, nextDay(date));
  const root = object(payload);
  const items = object(root?.data)?.itemList;
  if (root?.status !== 0 || !Array.isArray(items)) throw new AppError('HOTEL_QUERY_FAILED', '住宿信息暂不可用，请稍后重试');
  const results = items.slice(0, 8).flatMap(item => {
    const row = object(item);
    const url = bookingUrl(row?.detailUrl);
    if (!row || typeof row.name !== 'string' || !url) return [];
    const price = parsePrice(row.price);
    let image: string | null = null;
    try { const u = new URL(String(row.mainPic)); if (u.protocol === 'https:' && (u.hostname.endsWith('.alicdn.com') || u.hostname.endsWith('.tbcdn.cn'))) image = u.href; } catch {}
    return [{ name: row.name, address: typeof row.address === 'string' ? row.address : '', price, url, image }];
  });
  return { execution:proof, city, checkIn: date, checkOut: nextDay(date), queriedAt, results,
    hint: typeof root.systemMessage === 'string' ? root.systemMessage : '',
    disclaimer: '这是搜索报价，房型、间数及价格包含范围以预订页为准；未计入交通预算。' };
}
export type Comparison = ReturnType<typeof planTrip> & { id: string; trip: Trip; queriedAt: string; oldestQuote: string; expiresAt: string; source: string; searchedRoutes: number; partial: boolean; platformHints: string[]; execution: {engine:'bailian-managed-agent'; sessions:AgentProof[]} };
export async function getComparison(id: string) {
  const cloud = runtimeStore.getStore();
  if (cloud) return await cloud.loadComparison(id) as Comparison;
  const record = store.comparisons.get(id);
  if (!record || record.expires < Date.now()) throw new AppError('RESULT_EXPIRED', '比较记录已过期，请重新查询');
  return record.result;
}
export type Hotels = Awaited<ReturnType<typeof hotels>>;
