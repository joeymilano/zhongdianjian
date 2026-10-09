import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
config({ path: resolve('.env.local'), quiet: true });
const root = process.cwd();
const standalone = resolve(root, '.next/standalone');
if (!existsSync(resolve(standalone, 'server.js'))) throw new Error('请先运行 npm run build');
mkdirSync(resolve(standalone, '.next'), { recursive: true });
cpSync(resolve(root, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), resolve(standalone, 'public'), { recursive: true });
const child = spawn(process.execPath, [resolve(standalone, 'server.js')], {
  cwd: standalone, stdio: 'inherit',
  env: { ...process.env, HOSTNAME: process.env.APP_HOST || '127.0.0.1', PORT: process.env.PORT || '3088',
    DATA_DIR: resolve(root, process.env.DATA_DIR || '.local') },
});
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
