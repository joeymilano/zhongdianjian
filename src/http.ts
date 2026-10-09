import { z } from 'zod';
import { AppError } from './limits.js';
export async function readBody(request: Request) {
  const origin = request.headers.get('origin');
  // Next may normalize the internal URL hostname to localhost. The browser's
  // Host header retains 127.0.0.1 (or the public hostname); deployed proxies
  // should additionally pin APP_ORIGIN.
  const requestUrl = new URL(request.url);
  const allowedOrigin = process.env.APP_ORIGIN || `${requestUrl.protocol}//${request.headers.get('host') || requestUrl.host}`;
  if (origin && origin !== allowedOrigin) throw new AppError('ORIGIN', '不接受来自其他站点的请求', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError('CONTENT_TYPE', '请发送 JSON 请求', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('BODY', '请求为空', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24_000) { await reader.cancel(); throw new AppError('BODY_LIMIT', '内容过长，请精简后再试', 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('JSON', '请求格式无效', 400); }
}
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ code: 'VALIDATION', error: '请检查输入条件', details: error.issues.map(x => ({ path: x.path.join('.'), message: x.message })) }, 400);
  if (error instanceof AppError) return json({ code: error.code, error: error.message }, error.status);
  return json({ code: 'INTERNAL', error: '暂时未能完成请求，请稍后重试。当前条件已保留。' }, 500);
}
