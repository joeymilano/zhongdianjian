import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync } from 'node:fs';
import { createCloudStore } from '../cloudflare/store';
test('cloud budget remains atomic under concurrency and persists between request contexts', async () => {
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'test',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-08',d1Databases:['DB']}]}));
 try {
  const db=await mf.getD1Database('DB');
  for(const sql of readFileSync('migrations/0001_runtime.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
  await db.prepare('UPDATE budget SET reserved_fen=0,flyai=0,bailian=0,amap=0').run();
  const outcomes=await Promise.allSettled(Array.from({length:20},()=>createCloudStore(db).reserve('bailian',100,1000,100)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,10);
  assert.equal((await db.prepare('SELECT reserved_fen FROM budget').first<{reserved_fen:number}>())?.reserved_fen,1000);
  await assert.rejects(createCloudStore(db).reserve('bailian',100,1000,100));
  await createCloudStore(db).saveComparison('test',{accepted:true});
  assert.deepEqual(await createCloudStore(db).loadComparison('test'),{accepted:true});
  await db.prepare('UPDATE comparisons SET expires=0').run();
  await assert.rejects(createCloudStore(db).loadComparison('test'));
 }finally{await mf.dispose();}
});
