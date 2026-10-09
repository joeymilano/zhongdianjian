import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditTrains, parsePrice, dateTimeInShanghai, bookingUrl } from '../src/travel-data.js';

// Explicit synthetic fixtures for unit tests only. The product has no mock-data fallback.
function fixture(price: unknown = '¥61.50', overrides: Record<string, unknown> = {}) {
  return { status: 0, data: { itemList: [{ price, jumpUrl: 'https://router.feizhu.com/example', journeys: [{ segments: [{
    depCityName: '上海', arrCityName: '杭州', depStationName: '上海虹桥站', arrStationName: '杭州东站',
    depDateTime: '2026-10-10 23:30:00', arrDateTime: '2026-10-11 00:30:00',
    marketingTransportNo: 'TEST-ONLY', seatClassName: '二等座', quantity: null, ...overrides,
  }] }] }] } };
}
const query = { origin: '上海', destination: '杭州', date: '2026-10-10' } as const;

test('脱敏票价不能参与预算运算', () => {
  for (const input of ['6x', '7X', '¥8*', '××']) assert.equal(parsePrice(input).kind, 'masked');
});
test('金额用分处理，拒绝起价、范围、负数及异常格式', () => {
  assert.deepEqual(parsePrice('￥61.50'), { kind: 'exact', fen: 6150, raw: '￥61.50' });
  assert.equal(parsePrice('12.5元').kind, 'exact');
  for (const input of ['20起', '60-90', '-1', 'Infinity', '￥12.555', '999999999999999999999']) assert.equal(parsePrice(input).kind, 'invalid');
  assert.equal(parsePrice(null).kind, 'missing');
});
test('时刻采用上海时区，拒绝不可能的日期', () => {
  assert.equal(dateTimeInShanghai('2026-10-10 08:00:00'), Date.parse('2026-10-10T00:00:00Z'));
  assert.equal(dateTimeInShanghai('2026-02-30 08:00:00'), null);
  assert.equal(dateTimeInShanghai('2026-10-10 25:00:00'), null);
});
test('接受跨日车次但不把未知余票标为有票', () => {
  const audit = auditTrains(fixture(), query);
  assert.equal(audit.state, 'usable');
  assert.equal(audit.results[0].durationMinutes, 60);
  assert.equal(audit.results[0].inventoryVerified, false);
});
test('真实试用响应 price 字段脱敏必须阻断预算验收', () => {
  const audit = auditTrains(fixture('6x'), query);
  assert.equal(audit.state, 'masked');
  assert.equal(audit.exactQuotes, 0);
  assert.equal(audit.validSchedules, 1);
});
test('兼容官方文档 adultPrice 字段', () => {
  const data = fixture() as any;
  delete data.data.itemList[0].price;
  data.data.itemList[0].adultPrice = '61.50';
  assert.equal(auditTrains(data, query).exactQuotes, 1);
});
test('日期或城市不匹配的结果不能用于方案', () => {
  assert.equal(auditTrains(fixture('61', { depCityName: '北京' }), query).state, 'invalid');
  assert.equal(auditTrains(fixture('61', { depDateTime: '2026-10-09 23:30:00' }), query).state, 'invalid');
});
test('拒绝倒序时间、缺失坐席和外站链接', () => {
  assert.equal(auditTrains(fixture('61', { arrDateTime: '2026-10-10 20:00:00' }), query).state, 'invalid');
  assert.equal(auditTrains(fixture('61', { seatClassName: null }), query).state, 'invalid');
  for (const link of ['javascript:alert(1)', 'https://feizhu.com.evil.com', 'http://fliggy.com', 'https://user:secret@fliggy.com']) assert.equal(bookingUrl(link), null);
});
test('空结果、失败、结构变更不能混为无票', () => {
  assert.equal(auditTrains({ status: 0, data: { itemList: [] } }, query).state, 'empty');
  assert.equal(auditTrains({ status: 429 }, query).state, 'upstream_error');
  assert.equal(auditTrains({ status: 0, data: {} }, query).state, 'invalid');
});
test('直达查询若返回换乘结构，暂不纳入首版验收', () => {
  const data = fixture() as any;
  data.data.itemList[0].journeys[0].segments.push({});
  assert.equal(auditTrains(data, query).state, 'invalid');
});
