import './config.js';
import { runtimeStore } from './runtime-store.js';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}
type Ledger = { reservedFen: number; calls: { flyai: number; bailian: number; amap?: number } };
const dir = resolve(process.env.DATA_DIR || '.local');
const file = resolve(dir, 'usage.json');
function numeric(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new AppError('INVALID_CONFIG', '调用预算配置无效');
  return value;
}
export function ledgerStatus() {
  let ledger: Ledger;
  try { ledger = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new AppError('BUDGET_UNAVAILABLE', '调用额度记录不可读，已暂停新调用');
    ledger = { reservedFen: 0, calls: { flyai: 0, bailian: 0 } };
  }
  if (!Number.isSafeInteger(ledger.reservedFen) || ledger.reservedFen < 0 || !['flyai', 'bailian'].every(k => Number.isSafeInteger(ledger.calls?.[k as 'flyai']) && ledger.calls[k as 'flyai'] >= 0)) throw new AppError('BUDGET_UNAVAILABLE', '调用额度记录无效，已暂停新调用');
  return { ...ledger, limitFen: Math.round(numeric('API_BUDGET_CNY', 200, 300) * 100) };
}

// Synchronous reservation is atomic within the documented single Node process.
// This conservative allowance is NOT a provider bill. A persistent DATA_DIR is
// mandatory in deployment; do not horizontally scale without a shared ledger.
export function reserveCall(provider: 'flyai' | 'bailian' | 'amap') {
  const cloud = runtimeStore.getStore();
  const reserveFen = Math.ceil(numeric(provider === 'flyai' ? 'FLYAI_CALL_RESERVE_CNY' : provider === 'amap' ? 'AMAP_CALL_RESERVE_CNY' : 'BAILIAN_CALL_RESERVE_CNY', 1, 100) * 100);
  const cap = provider === 'flyai' ? 400 : 100;
  if (cloud) return cloud.reserve(provider, reserveFen, Math.round(numeric('API_BUDGET_CNY', 200, 300) * 100), cap);
  const ledger = ledgerStatus();
  const count = ledger.calls[provider] ?? 0;
  if (!Number.isSafeInteger(count) || count < 0) throw new AppError('BUDGET_UNAVAILABLE','调用额度记录无效');
  if (ledger.reservedFen + reserveFen > ledger.limitFen || count >= cap) throw new AppError('BUDGET_LIMIT', '本轮体验的调用额度已用完，已暂停查询');
  const updated: Ledger = { reservedFen: ledger.reservedFen + reserveFen, calls: { ...ledger.calls, [provider]: count + 1 } };
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file + '.tmp', JSON.stringify(updated), { mode: 0o600 });
    renameSync(file + '.tmp', file);
  } catch { throw new AppError('BUDGET_UNAVAILABLE', '无法持久保存调用额度，已暂停查询'); }
}

const state = globalThis as typeof globalThis & { zhongdianLimits?: Map<string, number[]> };
state.zhongdianLimits ??= new Map();
export function rateLimit(kind: string, cap: number, interval = 60_000) {
  const now = Date.now();
  const recent = (state.zhongdianLimits!.get(kind) || []).filter(t => now - t < interval);
  if (recent.length >= cap) throw new AppError('RATE_LIMIT', '查询较频繁，请稍等一分钟再试', 429);
  recent.push(now); state.zhongdianLimits!.set(kind, recent);
}
