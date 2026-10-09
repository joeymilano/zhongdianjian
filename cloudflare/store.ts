import { AppError } from '../src/limits';
import type { CloudStore } from '../src/runtime-store';
export function createCloudStore(db: D1Database): CloudStore { return {

        async reserve(provider,fen,limit,cap){
          // Column names come only from the internal provider union, never user input.
          if(!['flyai','bailian','amap'].includes(provider))throw new AppError('BUDGET_UNAVAILABLE','调用额度无法核验');
          const result=await db.prepare(`UPDATE budget SET reserved_fen=reserved_fen+?, ${provider}=${provider}+1 WHERE id=1 AND reserved_fen+?<=? AND ${provider}<? RETURNING reserved_fen`).bind(fen,fen,limit,cap).first();
          if(!result)throw new AppError('BUDGET_LIMIT','本轮体验的调用额度已用完，已暂停查询');
        },
        async saveComparison(id,value){ await db.prepare('INSERT INTO comparisons VALUES(?,?,?)').bind(id,JSON.stringify(value),Date.now()+600000).run(); },
        async loadComparison(id){
          const row=await db.prepare('SELECT value FROM comparisons WHERE id=? AND expires>?').bind(id,Date.now()).first<{value:string}>();
          if(!row)throw new AppError('RESULT_EXPIRED','比较记录已过期，请重新查询');
          return JSON.parse(row.value);
        },

}; }
