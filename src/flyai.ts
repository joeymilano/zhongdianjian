import './config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { validCity, isDate, type RouteQuery, type City } from './travel-data.js';
const run = promisify(execFile);
const bundle = resolve(process.cwd(), 'node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs');

export class ProviderError extends Error {
  constructor(public code: 'TIMEOUT' | 'INVALID_RESPONSE' | 'PROCESS_ERROR', message: string) { super(message); }
}

async function call(args: string[]): Promise<unknown> {
  let stdout: string;
  try {
    // Never invoke a shell and never interpolate credentials into command arguments.
    ({ stdout } = await run(process.execPath, [bundle, ...args], { timeout: 45_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env } }));
  } catch (error) {
    const killed = typeof error === 'object' && error !== null && 'killed' in error && error.killed;
    throw new ProviderError(killed ? 'TIMEOUT' : 'PROCESS_ERROR', killed ? '飞猪查询超时' : '飞猪查询未成功；原始进程输出未公开');
  }
  try { return JSON.parse(stdout.trim()); }
  catch { throw new ProviderError('INVALID_RESPONSE', '飞猪返回了无法解析的数据'); }
}

export async function searchTrains(query: RouteQuery): Promise<unknown> {
  if (!validCity(query.origin) || !validCity(query.destination) || !isDate(query.date) || query.origin === query.destination) throw new Error('无效的铁路查询条件');
  return call(['search-train', '--origin', query.origin, '--destination', query.destination, '--dep-date', query.date, '--journey-type', '1']);
}

export async function searchHotels(city: City, checkIn: string, checkOut: string): Promise<unknown> {
  if (!validCity(city) || !isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn) throw new Error('无效的住宿查询条件');
  return call(['search-hotel', '--dest-name', city, '--check-in-date', checkIn, '--check-out-date', checkOut]);
}
