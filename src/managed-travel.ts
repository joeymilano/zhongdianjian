import { validCity, isDate, type RouteQuery, type City } from './travel-data.js';
import { AppError } from './limits.js';
import { agentConfig, runManagedTask, extractToolResults, type AgentProof } from './managed-agent.js';
export function trainCommand(query: RouteQuery) {
  if (!validCity(query.origin) || !validCity(query.destination) || query.origin === query.destination || !isDate(query.date)) throw new AppError('VALIDATION', '铁路查询条件无效', 400);
  return `flyai search-train --origin ${query.origin} --destination ${query.destination} --dep-date ${query.date} --journey-type 1`;
}
export function hotelCommand(city: City, date: string, end: string) {
  if (!validCity(city) || !isDate(date) || !isDate(end) || end <= date) throw new AppError('VALIDATION', '住宿查询条件无效', 400);
  return `flyai search-hotel --dest-name ${city} --check-in-date ${date} --check-out-date ${end}`;
}
const cooldown = globalThis as typeof globalThis & { travelRetryAfter?: number };
async function queryCommands(commands: string[], purpose: string) {
  if ((cooldown.travelRetryAfter || 0) > Date.now()) throw new AppError('TRAVEL_COOLDOWN', '旅行数据服务正在冷却，请稍后再试，避免重复触发限制。', 429);
  agentConfig(true);
  if (!commands.length || commands.length > 64 || new Set(commands).size !== commands.length) throw new AppError('VALIDATION','查询批次无效',400);
  const run = await runManagedTask({purpose,commands,prompt:`这是中点见服务端生成的旅行数据任务。使用已安装的飞猪官方 Skill 和 CLI。每条命令单独调用一次 bash，command 参数必须与下列字符串完全一致。平台会逐次核对和批准工具调用。不要合并命令、添加管道、重定向、echo、环境变量打印或安装命令；不要读取或输出密钥。不得伪造结果或用总结替代工具输出。每条命令只执行一次，空结果或失败也不得重试；失败时立即结束，不安装或调整环境。命令完成后简短结束即可。任何缺失工具或凭据请直接说明并结束。\n命令清单：\n${commands.join('\n')}`});
  if (run.warning?.code === 'TRAVEL_RISK_CONTROL' || run.warning?.code === 'TRAVEL_RATE_LIMIT') cooldown.travelRetryAfter = Date.now() + 10 * 60_000;
  const results = extractToolResults(run.events, commands);
  if (!results.size && run.warning) throw new AppError(run.warning.code, run.warning.message);
  if (!results.size) throw new AppError('AGENT_NO_TOOL_DATA', '云端任务没有返回可核验的飞猪工具数据，请检查 Skill、凭据和工具输出。');
  return {results,proof:run.proof,warning:run.warning};
}
export async function managedTrains(queries: RouteQuery[]) {
  return queryCommands(queries.map(trainCommand), '往返车次查询');
}
export async function managedHotels(city: City, date: string, end: string) {
  const command = hotelCommand(city,date,end);
  const run = await queryCommands([command], '住宿查询');
  const result = run.results.get(command)!;
  return {payload:result.payload,queriedAt:result.queriedAt,proof:run.proof};
}
export type { AgentProof };
