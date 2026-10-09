import { POST as compare } from '../app/api/compare/route';
import { POST as parse } from '../app/api/parse/route';
import { POST as explain } from '../app/api/explain/route';
import { POST as hotels } from '../app/api/hotels/route';
import { POST as local } from '../app/api/local/route';
import { GET as status } from '../app/api/status/route';
import { AppError } from '../src/limits';
import { failure, json } from '../src/http';
import { createCloudStore } from './store';
import { runtimeStore } from '../src/runtime-store';
const routes: Record<string, (request: Request) => Promise<Response>> = {
  '/api/compare':compare, '/api/parse':parse, '/api/explain':explain, '/api/hotels':hotels, '/api/local':local,
};
export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if(path==='/api/status' && request.method==='GET') {
      const response=await status().json() as Record<string,unknown>;
      return json({...response,map:String(env.PUBLIC_MAP_ENABLED)==='true' && response.map,mapNotice:String(env.PUBLIC_MAP_ENABLED)==='true'?'':'同城查询正在核对公开使用许可，暂未开放。'});
    }
    if (!routes[path]) return json({error:'页面不存在'},404);
    if (request.method !== 'POST') return json({error:'请求方式不支持'},405);
    if (path==='/api/local' && String(env.PUBLIC_MAP_ENABLED)!=='true') return json({code:'MAP_PUBLIC_PENDING',error:'同城查询正在完成公开使用许可核对，暂未开放。'},503);
    const token=crypto.randomUUID();
    let acquired=false;
    try {
      const now=Date.now();
      // One lease for expensive operations across all isolates and restarts.
      const lease=await env.DB.prepare('INSERT INTO leases(id,token,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE leases.expires < ? RETURNING token').bind('provider',token,now+330000,now).first<{token:string}>();
      if(lease?.token!==token)throw new AppError('BUSY','已有一次查询正在进行，请稍候再试',429);
      acquired=true;
      const window=Math.floor(now/60000);
      const rate=await env.DB.prepare('INSERT INTO requests(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(`${path}:${window}`,now+120000).first<{count:number}>();
      if(!rate || rate.count>(path==='/api/local'?20:6))throw new AppError('RATE_LIMIT','查询较频繁，请稍等一分钟再试',429);
      await env.DB.batch([env.DB.prepare('DELETE FROM requests WHERE expires < ?').bind(now),env.DB.prepare('DELETE FROM comparisons WHERE expires < ?').bind(now)]);
      return await runtimeStore.run(createCloudStore(env.DB),()=>routes[path](request));
    } catch(error) { return failure(error); }
    finally { if(acquired) await env.DB.prepare('DELETE FROM leases WHERE id=? AND token=?').bind('provider',token).run(); }
  },
} satisfies ExportedHandler<Env>;
