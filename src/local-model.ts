import { z } from 'zod';
import { citySchema } from './model.js';
import { isDate } from './travel-data.js';
export const placeSchema = z.object({ id:z.string().min(1).max(60), name:z.string().min(1).max(120), address:z.string().max(240), city:z.string().min(1).max(30), location:z.string().regex(/^\d{1,3}(?:\.\d{1,6})?,\d{1,2}(?:\.\d{1,6})?$/) });
export type Place = z.infer<typeof placeSchema>;
export const localTripSchema = z.object({city:citySchema,date:z.string().refine(isDate),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),members:z.array(z.object({name:z.string().trim().min(1).max(16),place:placeSchema,maxMinutes:z.number().min(5).max(240),mode:z.enum(['transit','walking','driving'])})).min(2).max(4), candidates:z.array(placeSchema).min(1).max(3)}).superRefine((t,c)=>{if(new Set(t.members.map(m=>m.name)).size!==t.members.length)c.addIssue({code:'custom',message:'请给每个人不同的称呼'});if(new Set(t.candidates.map(p=>p.id)).size!==t.candidates.length)c.addIssue({code:'custom',message:'候选地点不能重复'});});
export type LocalTrip = z.infer<typeof localTripSchema>;
export type LocalRoute = {minutes:number;distance:number|null;fareFen:number|null;steps:string[]};
export type LocalPlan = {place:Place; journeys:(LocalRoute & {name:string;origin:Place;mode:string})[];maxMinutes:number;totalMinutes:number};
export function rankLocalPlans(plans:LocalPlan[]) { return [...plans].sort((a,b)=>a.maxMinutes-b.maxMinutes || a.totalMinutes-b.totalMinutes); }
