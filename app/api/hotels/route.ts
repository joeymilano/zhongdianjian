import { z } from 'zod';
import { citySchema, shanghaiToday } from '../../../src/model';
import { isDate } from '../../../src/travel-data';
import { hotels } from '../../../src/travel-service';
import { rateLimit, AppError } from '../../../src/limits';
import { readBody, json, failure } from '../../../src/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    rateLimit('hotels', 5);
    const { city, date } = z.object({ city: citySchema, date: z.string().refine(isDate) }).parse(await readBody(request));
    if (date < shanghaiToday()) throw new AppError('PAST_DATE', '请选择今天或之后的入住日期', 400);
    return json(await hotels(city, date));
  } catch (e) { return failure(e); }
}
