import { z } from 'zod';
import { memberSchema, tripSchema, citySchema, type Trip } from './model.js';
import { isDate } from './travel-data.js';
import { AppError } from './limits.js';

const patchSchema = z.object({
  updates: z.object({
    date:z.string().refine(isDate).optional(), cities:z.array(citySchema).min(1).max(8).optional(),
    minTogetherHours:z.number().min(1).max(36).optional(), preferences:z.string().max(500).optional(),
  }).strict().default({}),
  memberUpdates:z.array(memberSchema.partial().required({id:true}).strict()).max(4).default([]),
  addMembers:z.array(memberSchema.strict()).max(2).default([]),
  removeMemberIds:z.array(memberSchema.shape.id).max(2).default([]),
  questions:z.array(z.string().max(200)).max(6).default([]),
}).strict();

export function applyIntentPatch(current:Trip, raw:unknown, userText?:string) {
  const parsed=patchSchema.safeParse(raw);
  if(!parsed.success) throw new AppError('AI_RESPONSE','整理结果不符合范围，当前表单未改变，请换一种说法');
  const p=parsed.data;
  const ids=new Set(current.members.map(m=>m.id));
  const changed=p.memberUpdates.map(m=>m.id);
  // An explicit unique name must never silently resolve to another member.
  const compact=(s:string)=>s.replace(/\s+/g,'');
  const named=userText ? current.members.filter(m=>!['我','本人','自己'].includes(m.name) && compact(userText).includes(compact(m.name))) : [];
  if(named.length && changed.some(id=>!named.some(m=>m.id===id)))
    throw new AppError('AI_RESPONSE','整理结果的成员与提到的称呼不一致，当前表单未改变，请按成员分别描述');
  if(new Set(changed).size!==changed.length || changed.some(id=>!ids.has(id) || p.removeMemberIds.includes(id)) || p.removeMemberIds.some(id=>!ids.has(id)) || p.addMembers.some(m=>ids.has(m.id)))
    throw new AppError('AI_RESPONSE','无法确认需要修改的成员，当前表单未改变');
  // Unmentioned fields come from the confirmed form, never a regenerated copy.
  const members=current.members.filter(m=>!p.removeMemberIds.includes(m.id)).map(m=>({...m,...p.memberUpdates.find(u=>u.id===m.id)}));
  const result=tripSchema.safeParse({...current,...p.updates,members:[...members,...p.addMembers]});
  if(!result.success) throw new AppError('AI_RESPONSE','这些修改超出了支持范围，当前表单未改变');
  return {trip:result.data,questions:p.questions};
}
