import { z } from 'zod';
import { tripSchema, shanghaiToday } from '../../../src/model';
import { compareTrip } from '../../../src/travel-service';
import { readBody, json, failure } from '../../../src/http';
import { rateLimit, AppError } from '../../../src/limits';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    rateLimit('compare', 3);
    const { trip, refresh } = z.object({ trip: tripSchema, refresh: z.boolean().default(false) }).parse(await readBody(request));
    if (trip.date < shanghaiToday()) throw new AppError('PAST_DATE', '请选择今天或之后的出发日期', 400);
    return json(await compareTrip(trip, refresh));
  } catch (e) { return failure(e); }
}
