import './config.js';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError, reserveCall } from './limits.js';
import { object, parsePrice } from './travel-data.js';
import { placeSchema, rankLocalPlans, type Place, type LocalTrip, type LocalRoute, type LocalPlan } from './local-model.js';
export function mapConfigured() {return !!process.env.AMAP_API_KEY?.trim();}

async function amap(path:string, params:Record<string,string>) {
  const key=process.env.AMAP_API_KEY?.trim();
  if(!key)throw new AppError('MAP_NOT_CONFIGURED','同城地点与路线服务尚未接通。请先配置高德 Web 服务凭据；当前不会生成路线或估算时间。');
  const query=new URLSearchParams(params);
  await pause(400);
  await reserveCall('amap'); query.set('key',key); query.set('output','JSON');
  let response:Response;try{response=await fetch('https://restapi.amap.com/v3/'+path+'?'+query,{signal:AbortSignal.timeout(12_000),redirect:'manual'});}catch{throw new AppError('MAP_TIMEOUT','地图服务暂时没有响应，请稍后重试。');}
  if(!response.ok)throw new AppError('MAP_NETWORK','地图服务暂不可用，请稍后重试。');
  const payload=object(await response.json());
  if(!payload)throw new AppError('MAP_UPSTREAM','地图返回格式无法核验。');
  if(payload.status!=='1')throw new AppError('MAP_UPSTREAM',payload.infocode==='10003'?'地图调用额度已用完，请稍后再试。':'地图未完成请求，请检查服务权限或稍后重试。');
  return payload;
}
function places(payload:unknown) {
  const rows=object(payload)?.pois;if(!Array.isArray(rows))return [];
  return rows.flatMap(row=>{const p=object(row);if(!p)return [];const parsed=placeSchema.safeParse({id:p.id,name:p.name,address:typeof p.address==='string'?p.address:'',city:p.cityname,location:p.location});return parsed.success?[parsed.data]:[];});
}
export async function searchPlaces(city:string,keywords:string){return places(await amap('place/text',{city,keywords,citylimit:'true',offset:'6',page:'1',extensions:'base'}));}
// Coordinates from the browser are never trusted for routing: rehydrate each
// chosen POI from the provider and verify that it belongs to the selected city.
async function verifyPlace(input:Place,city:string){
 const p=places(await amap('place/detail',{id:input.id})).find(p=>p.id===input.id);
 if(!p||p.city.replace(/市$/,'')!==city.replace(/市$/,''))throw new AppError('PLACE_CHANGED','地点无法核验或不在所选城市，请重新搜索并选择地点。',400);return p;
}
export async function suggestPlaces(city:string,origins:Place[],kind:string){
 const confirmed:Place[]=[];for(const p of origins)confirmed.push(await verifyPlace(p,city));
 const xy=confirmed.map(p=>p.location.split(',').map(Number));const center=[0,1].map(i=>(xy.reduce((sum,p)=>sum+p[i],0)/xy.length).toFixed(6)).join(',');
 // The geometric centre only seeds a POI search; route times determine fairness.
 return places(await amap('place/around',{location:center,radius:'10000',keywords:kind,offset:'10',page:'1',sortrule:'distance',extensions:'base'})).filter(p=>p.city.replace(/市$/,'')===city.replace(/市$/,'')).slice(0,3);
}
function number(value:unknown){return (typeof value==='number'||typeof value==='string'&&/^\d+(\.\d+)?$/.test(value))&&Number.isFinite(Number(value))?Number(value):null;}
export function parseLocalRoute(payload:unknown,mode:string):LocalRoute|null{
 const root=object(payload);if(root?.status!=='1')return null;const route=object(root.route);const list=mode==='transit'?route?.transits:route?.paths;if(!Array.isArray(list))return null;
 const valid=list.flatMap(value=>{const p=object(value);if(!p)return [];const seconds=number(p.duration);if(seconds===null||seconds<=0)return [];const price=parsePrice(p.cost);const steps:string[]=[];
 if(mode==='transit'&&Array.isArray(p.segments))for(const v of p.segments){const seg=object(v);const lines=object(seg?.bus)?.buslines;if(Array.isArray(lines))for(const l of lines){const line=object(l);if(typeof line?.name==='string')steps.push(line.name);}const walk=number(object(seg?.walking)?.distance);if(walk!==null&&walk>0)steps.push(`步行 ${Math.round(walk)} 米`);}
 if(mode!=='transit'&&Array.isArray(p.steps))for(const v of p.steps.slice(0,5)){const step=object(v);if(typeof step?.instruction==='string')steps.push(step.instruction);}
 return [{minutes:Math.ceil(seconds/60),distance:number(p.distance),fareFen:mode==='transit'&&price.kind==='exact'?price.fen:null,steps}];});
 return valid.sort((a,b)=>a.minutes-b.minutes)[0]||null;
}
export async function compareLocal(trip:LocalTrip){
 const members=[];for(const m of trip.members)members.push({...m,place:await verifyPlace(m.place,trip.city)});
 const candidates=[];for(const p of trip.candidates)candidates.push(await verifyPlace(p,trip.city));
 const plans:LocalPlan[]=[];const exclusions:{place:string;reason:string}[]=[];
 for(const place of candidates){const journeys:LocalPlan['journeys']=[];
  for(const m of members){const path=m.mode==='transit'?'direction/transit/integrated':'direction/'+m.mode;
   const payload=await amap(path,{origin:m.place.location,destination:place.location,...(m.mode==='transit'?{city:trip.city,date:trip.date,time:trip.time,strategy:'0'}:{})});
   const route=parseLocalRoute(payload,m.mode);
   if(!route){exclusions.push({place:place.name,reason:`${m.name}的路线未返回可核验时间`});continue;}
   if(route.minutes>m.maxMinutes){exclusions.push({place:place.name,reason:`${m.name}需约 ${route.minutes} 分钟，超过 ${m.maxMinutes} 分钟上限`});continue;}
   journeys.push({...route,name:m.name,origin:m.place,mode:m.mode});
  }
  if(journeys.length===members.length)plans.push({place,journeys,maxMinutes:Math.max(...journeys.map(j=>j.minutes)),totalMinutes:journeys.reduce((n,j)=>n+j.minutes,0)});
 }
 return {plans:rankLocalPlans(plans),exclusions,queriedAt:new Date().toISOString(),source:'高德地图',disclaimer:'比较所选地点的单程预计用时；公交按所填出发时间规划，步行与驾车为查询时估计。未包含返程、聚会消费和停车费。'};
}
