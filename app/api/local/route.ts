import { z } from 'zod';
import { readBody, json, failure } from '../../../src/http';
import { rateLimit, AppError } from '../../../src/limits';
import { citySchema, shanghaiToday } from '../../../src/model';
import { placeSchema, localTripSchema } from '../../../src/local-model';
import { searchPlaces, suggestPlaces, compareLocal } from '../../../src/local-service';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('search'),city:citySchema,keywords:z.string().trim().min(2).max(80)}),
 z.object({action:z.literal('suggest'),city:citySchema,origins:z.array(placeSchema).min(2).max(4),kind:z.enum(['咖啡厅','餐厅','公园'])}),
 z.object({action:z.literal('compare'),trip:localTripSchema}),
]);
export const runtime='nodejs';export const maxDuration=180;
export async function POST(request:Request){try{const data=schema.parse(await readBody(request));rateLimit('local-'+data.action,data.action==='search'?20:3);
 if(data.action==='search')return json({places:await searchPlaces(data.city,data.keywords)});
 if(data.action==='suggest')return json({places:await suggestPlaces(data.city,data.origins,data.kind)});
 if(data.trip.date<shanghaiToday())throw new AppError('PAST_DATE','请选择今天或之后的日期',400);
 return json(await compareLocal(data.trip));
}catch(e){return failure(e);}}
