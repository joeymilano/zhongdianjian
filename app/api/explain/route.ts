import { z } from 'zod';
import { explainComparison } from '../../../src/ai-service';
import { getComparison } from '../../../src/travel-service';
import { rateLimit } from '../../../src/limits';
import { readBody, json, failure } from '../../../src/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    rateLimit('ai', 6);
    const { id } = z.object({ id: z.string().uuid() }).parse(await readBody(request));
    return json(await explainComparison(await getComparison(id)));
  } catch (e) { return failure(e); }
}
