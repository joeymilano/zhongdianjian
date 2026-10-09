import { z } from 'zod';
import { tripSchema } from '../../../src/model';
import { parseIntent } from '../../../src/ai-service';
import { rateLimit } from '../../../src/limits';
import { readBody, json, failure } from '../../../src/http';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    rateLimit('ai', 6);
    const { text, current } = z.object({ text: z.string().trim().min(1).max(3000), current: tripSchema }).parse(await readBody(request));
    return json(await parseIntent(text, current));
  } catch (e) { return failure(e); }
}
