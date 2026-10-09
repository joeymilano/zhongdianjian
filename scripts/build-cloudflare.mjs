import { mkdtemp, cp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const stage = await mkdtemp(join(tmpdir(), 'zhongdianjian-export-'));
try {
  for (const name of ['app','src','public','package.json','tsconfig.json','next-env.d.ts']) await cp(resolve(name),join(stage,name),{recursive:true});
  await rm(join(stage,'app/api'),{recursive:true});
  await symlink(resolve('node_modules'),join(stage,'node_modules'),'dir');
  const page = join(stage,'app/page.tsx');
  await writeFile(page,(await readFile(page,'utf8')).replace("export const dynamic = 'force-dynamic';",''));
  await writeFile(join(stage,'next.config.mjs'),`export default {output:'export',images:{unoptimized:true},webpack(c){c.resolve.extensionAlias={...c.resolve.extensionAlias,'.js':['.ts','.tsx','.js']};return c;}}`);
  const run=spawnSync(process.execPath,[resolve('node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:stage,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  if(run.status!==0)throw new Error('Static export failed');
  await rm(resolve('out'),{recursive:true,force:true});
  await cp(join(stage,'out'),resolve('out'),{recursive:true});
  await writeFile(resolve('out/_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: geolocation=(), camera=(), microphone=()\n');
} finally { await rm(stage,{recursive:true,force:true}); }
