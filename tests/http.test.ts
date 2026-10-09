import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBody } from '../src/http.js';
const req = (body: string, origin = 'http://localhost:3088') => new Request('http://localhost:3088/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body });
test('拒绝跨站请求和超过上限的请求体', async () => {
  await assert.rejects(readBody(req('{}', 'https://example.com')), /其他站点/);
  await assert.rejects(readBody(req('x'.repeat(25_000))), /内容过长/);
  assert.deepEqual(await readBody(req('{"text":"ok"}')), { text: 'ok' });
});
test('本地127.0.0.1请求不被Next内部localhost标准化误拒绝', async () => {
  const request = new Request('http://localhost:3088/api/compare', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3088', Host: '127.0.0.1:3088' }, body: '{}' });
  assert.deepEqual(await readBody(request), {});
});
