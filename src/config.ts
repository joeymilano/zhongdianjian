import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve('.env.local'), quiet: true });

export function configurationStatus() {
  return {
    flyaiKeyConfigured: !!process.env.FLYAI_API_KEY?.trim(),
    bailianKeyConfigured: !!process.env.DASHSCOPE_API_KEY?.trim(),
    model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
  };
}
