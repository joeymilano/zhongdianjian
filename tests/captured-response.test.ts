import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditTrains } from '../src/travel-data.js';

test('保留的真实匿名响应：车次可读但10条脱敏票价全部不能通过预算验收', () => {
  const response = JSON.parse(readFileSync(new URL('../evidence/2026-10-08-trial/shanghai-hangzhou.json', import.meta.url), 'utf8'));
  const audit = auditTrains(response, { origin: '上海', destination: '杭州', date: '2026-10-10' });
  assert.equal(audit.returned, 10);
  assert.equal(audit.validSchedules, 10);
  assert.equal(audit.maskedQuotes, 10);
  assert.equal(audit.exactQuotes, 0);
  assert.equal(audit.state, 'masked');
  assert.equal(audit.results.every(x => x.inventoryVerified === false), true);
});
