import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { configurationStatus } from '../src/config.js';
import { searchTrains, searchHotels, ProviderError } from '../src/flyai.js';
import { auditTrains, isDate, object, parsePrice, bookingUrl, type City } from '../src/travel-data.js';
import { probeBailian } from '../src/bailian.js';

const suppliedDate = process.argv.find(x => x.startsWith('--date='))?.slice(7);
const trial = process.argv.includes('--trial');
if (!suppliedDate || !isDate(suppliedDate)) throw new Error('请提供有效出发日期，例如 --date=2026-10-10');
const outbound = suppliedDate;
const inbound = new Date(Date.parse(outbound + 'T12:00:00+08:00') + 86400_000).toISOString().slice(0, 10);
const config = configurationStatus();
if (!trial && !config.flyaiKeyConfigured) {
  console.error('需要 FLYAI_API_KEY 才能运行完整验证。要验证脱敏响应可显式加 --trial。');
  process.exit(2);
}
const observedAt = new Date().toISOString();
const outputDir = `evidence/${outbound}-${trial ? 'trial' : 'authenticated'}-${Date.now()}`;
await mkdir(outputDir, { recursive: true });
const groups: { name: string; origins: City[]; destination: City }[] = [
  { name: '三城朋友', origins: ['上海', '南京', '合肥'], destination: '杭州' },
  { name: '苏南朋友', origins: ['苏州', '无锡', '常州'], destination: '南京' },
];
const routes: Record<string, unknown>[] = [];
let abort = false;
let calls = 0;
for (const group of groups) {
  for (const city of group.origins) {
    for (const query of [
      { origin: city, destination: group.destination, date: outbound },
      { origin: group.destination, destination: city, date: inbound },
    ]) {
      if (abort) break;
      const label = `${query.origin}-${query.destination}-${query.date}`;
      const start = Date.now();
      try {
        calls++;
        const payload = await searchTrains(query);
        const audit = auditTrains(payload, query);
        // These are public route queries only. Never persist environment or process stderr.
        await writeFile(`${outputDir}/${label}.json`, JSON.stringify(payload, null, 2));
        const { results, ...summary } = audit;
        routes.push({ group: group.name, ...query, ...summary, durationMs: Date.now() - start });
        console.log(`${label}: ${audit.state}, ${audit.returned} 条 / ${audit.exactQuotes} 条明确票价 / ${audit.maskedQuotes} 条脱敏票价`);
        // Stop on upstream failure to avoid hammering a provider that is rejecting calls.
        if (audit.state === 'upstream_error') abort = true;
      } catch (error) {
        const code = error instanceof ProviderError ? error.code : 'UNKNOWN';
        routes.push({ ...query, group: group.name, state: 'error', code });
        console.log(`${label}: ${code}`);
        abort = true;
      }
      if (!abort) await pause(1200);
    }
  }
}
let hotel: Record<string, unknown> = { state: 'skipped' };
if (!abort) {
  try {
    calls++;
    const payload = await searchHotels('杭州', outbound, inbound);
    await writeFile(`${outputDir}/hotel-hangzhou.json`, JSON.stringify(payload, null, 2));
    const root = object(payload);
    const items = object(root?.data)?.itemList;
    hotel = root?.status === 0 && Array.isArray(items) ? {
      state: items.length ? 'returned' : 'empty', count: items.length,
      exactQuotes: items.filter(x => parsePrice(object(x)?.price).kind === 'exact').length,
      bookingLinks: items.filter(x => bookingUrl(object(x)?.detailUrl)).length,
      limitation: '报价不是多人总价，房型、间数及完整条款仍需预订页确认',
    } : { state: 'upstream_error' };
  } catch { hotel = { state: 'error' }; }
}
const bailian = trial ? { state: 'skipped_in_trial' } : await probeBailian();
const priceGatePassed = routes.length === 12 && routes.every(r => (r.state === 'usable' || r.state === 'partial') && Number(r.exactQuotes) > 0);
const nextPhaseAllowed = priceGatePassed && bailian.state === 'connected';
const report = {
  project: '中点见', observedAt, outbound, inbound, mode: trial ? 'trial' : 'authenticated',
  cliVersion: '1.0.16', config, flyaiCalls: calls, bailianCalls: trial || !config.bailianKeyConfigured ? 0 : 1,
  priceGatePassed, nextPhaseAllowed, routes, hotel, bailian,
  interpretation: nextPhaseAllowed ? '基本接入关卡通过，仍需实现并验证完整产品。' : '前置接入关卡未通过；不得把脱敏或缺失价格作为可预算的报价，不得声称产品已完成。',
};
await writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`报告：${outputDir}/report.json`);
console.log(report.interpretation);
if (!nextPhaseAllowed) process.exitCode = 2;
