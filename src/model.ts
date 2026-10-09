import { z } from 'zod';
import { isDate, validCity } from './travel-data.js';
export const citySchema = z.string().trim().transform(s=>s.replace(/市$/, '')).refine(validCity, '请填写中文城市名，例如北京、成都（不含车站名）');
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const memberSchema = z.object({
  id: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(16), city: citySchema,
  earliestDeparture: clock, latestReturn: clock,
  budget: z.number().min(0).max(3000), maxRideHours: z.number().min(0.25).max(24),
});
export const tripSchema = z.object({
  date: z.string().refine(isDate, '请输入有效日期'),
  members: z.array(memberSchema).min(2).max(4),
  cities: z.array(citySchema).min(1).max(8),
  minTogetherHours: z.number().min(1).max(36),
  preferences: z.string().max(500),
}).superRefine((trip, ctx) => {
  if (new Set(trip.members.map(p => p.id)).size !== trip.members.length) ctx.addIssue({ code: 'custom', message: '成员编号不能重复', path: ['members'] });
  if (new Set(trip.members.map(p => p.name)).size !== trip.members.length) ctx.addIssue({ code: 'custom', message: '请给每个人不同的称呼，以便修改条件', path: ['members'] });
  if (new Set(trip.cities).size !== trip.cities.length) ctx.addIssue({ code: 'custom', message: '会合城市不能重复', path: ['cities'] });
});
export type Trip = z.infer<typeof tripSchema>;
export type Member = Trip['members'][number];
export type City = z.infer<typeof citySchema>;
export type Goal = 'fair' | 'cheap' | 'together';
export const GOALS: Record<Goal, { name: string; detail: string }> = {
  fair: { name: '少一点迁就', detail: '让最长往返乘车时间尽量短' },
  cheap: { name: '少一点花费', detail: '全组往返交通费尽量低' },
  together: { name: '多一点相聚', detail: '共同停留窗口尽量长' },
};
export function nextDay(date: string) {
  return new Date(Date.parse(date + 'T12:00:00+08:00') + 86400_000).toISOString().slice(0, 10);
}
export function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function nextSaturday() {
  const today = shanghaiToday();
  const day = new Date(today + 'T12:00:00+08:00').getUTCDay();
  return new Date(Date.parse(today + 'T12:00:00+08:00') + ((6 - day + 7) % 7 || 7) * 86400_000).toISOString().slice(0, 10);
}
export function defaultTrip(date = nextSaturday()): Trip {
  return { date, members: [
    { id: 'm1', name: '我', city: '上海', earliestDeparture: '09:00', latestReturn: '21:00', budget: 300, maxRideHours: 6 },
    { id: 'm2', name: '朋友 A', city: '南京', earliestDeparture: '09:00', latestReturn: '21:00', budget: 300, maxRideHours: 6 },
    { id: 'm3', name: '朋友 B', city: '合肥', earliestDeparture: '12:00', latestReturn: '20:00', budget: 300, maxRideHours: 6 },
  ], cities: ['杭州'], minTogetherHours: 12, preferences: '' };
}
