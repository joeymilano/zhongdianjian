import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparisonFacts } from '../src/ai-service';
import type { Comparison } from '../src/travel-service';
test('public result explanation preserves verified costs when more time together is not the most expensive option',()=>{
 const {result}=JSON.parse(readFileSync('evidence/public-live-verification.json','utf8')) as {result:Comparison};
 const text=comparisonFacts(result);
 assert.match(text,/少赶路：济南，全组往返交通费 ¥690，/);
 assert.match(text,/多相聚：济南，全组往返交通费 ¥688，/);
 assert.doesNotMatch(text,/最高|保证有票|全国最优/);
});
