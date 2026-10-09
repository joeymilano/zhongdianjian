import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('预算预留持久化、超限停止、损坏时拒绝调用', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhongdian-ledger-test-'));
  process.env.DATA_DIR = dir; process.env.API_BUDGET_CNY = '2';
  process.env.FLYAI_CALL_RESERVE_CNY = '1';
  const { reserveCall, ledgerStatus } = await import('../src/limits.js');
  try {
    reserveCall('flyai'); assert.equal(ledgerStatus().reservedFen, 100);
    reserveCall('flyai'); assert.throws(() => reserveCall('flyai'), /额度已用完/);
    assert.equal(ledgerStatus().calls.flyai, 2);
    writeFileSync(join(dir, 'usage.json'), 'corrupt');
    assert.throws(() => reserveCall('bailian'), /不可读/);
  } finally { rmSync(dir, { recursive: true }); }
});
