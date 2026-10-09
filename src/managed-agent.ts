import './config.js';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError, reserveCall } from './limits.js';
import { object } from './travel-data.js';

export type AgentEvent = { id: string; type: string; created_at?: string; role?: string; is_error?: boolean; content?: {type: string; text?: string; data?: Record<string, unknown>}[]; error?: {code?: string; message?: string} };
export type AgentProof = { engine: 'bailian-managed-agent'; sessionId: string; agentId: string; eventIds: string[] };
export type AgentConfig = { base: string; key: string; agentId: string; environmentId: string; vaultId?: string; travelKey?: string };
export function validAgentBase(base: string) {
  try { const u = new URL(base); return u.protocol === 'https:' && /^ws-[a-z0-9]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(u.hostname) && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/api\/v1\/agentstudio\/?$/.test(u.pathname); } catch { return false; }
}
export function managedStatus() {
  const key = !!process.env.MANAGED_AGENT_API_KEY?.trim();
  const resources = validAgentBase(process.env.MANAGED_AGENT_BASE_URL || '') && /^agent_[A-Za-z0-9]+$/.test(process.env.MANAGED_AGENT_ID || '') && /^agent_[A-Za-z0-9]+$/.test(process.env.MANAGED_AGENT_TEXT_AGENT_ID || '') && /^env_[A-Za-z0-9]+$/.test(process.env.MANAGED_AGENT_ENVIRONMENT_ID || '');
  const travelCredentials = process.env.MANAGED_AGENT_TRAVEL_AUTH === 'session_env'
    ? !!process.env.FLYAI_API_KEY?.trim()
    : /^vlt_[A-Za-z0-9]+$/.test(process.env.MANAGED_AGENT_VAULT_ID || '');
  return { engine: 'bailian-managed-agent' as const, configured: key && resources, travelConfigured: key && resources && travelCredentials, liveVerified: false };
}
export function agentConfig(travel = false): AgentConfig {
  const status = managedStatus();
  if (!status.configured) throw new AppError('MANAGED_AGENT_NOT_CONFIGURED', '云端智能体尚未接通。需要完成百炼凭据和运行环境配置；当前不会改用本地查询。');
  if (travel && !status.travelConfigured) throw new AppError('AGENT_VAULT_NOT_CONFIGURED', '云端旅行数据凭据尚未配置，请先将飞猪 Key 接入百炼密钥库。');
  return { base: process.env.MANAGED_AGENT_BASE_URL!.replace(/\/$/, ''), key: process.env.MANAGED_AGENT_API_KEY!.trim(), agentId: travel ? process.env.MANAGED_AGENT_ID! : process.env.MANAGED_AGENT_TEXT_AGENT_ID!, environmentId: process.env.MANAGED_AGENT_ENVIRONMENT_ID!, vaultId: process.env.MANAGED_AGENT_VAULT_ID, ...(travel && process.env.MANAGED_AGENT_TRAVEL_AUTH === 'session_env' ? {travelKey:process.env.FLYAI_API_KEY!.trim()} : {}) };
}
function blocks(event: AgentEvent) { return (event.content || []).flatMap(b => b.type === 'data' && b.data ? [b.data] : []); }
export function commandFrom(data: Record<string, unknown>): string | null {
  try { const args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : data.arguments; return typeof args?.command === 'string' ? args.command : null; } catch { return null; }
}
function billingError(value: unknown) { return /Arrearage|good standing|insufficient.balance|overdue|OUT_OF_SERVICE/i.test(JSON.stringify(value)); }
export function checkAgentError(events: AgentEvent[]) {
  const error = events.find(e => e.type === 'error');
  if (!error) return;
  if (billingError(error.error)) throw new AppError('AGENT_BILLING', '百炼账户余额或计费状态异常，云端任务未完成。请在阿里云控制台处理后重试。');
  throw new AppError('AGENT_EXECUTION', '云端智能体执行失败；未生成或补造旅行结果。');
}
export function extractToolResults(events: AgentEvent[], commands: string[]): Map<string, {payload: unknown; eventId: string; queriedAt: string}> {
  const calls = new Map<string, string>();
  for (const e of events) if (e.type === 'tool_call') for (const b of blocks(e)) {
    const command = commandFrom(b);
    if (b.name === 'bash' && command && commands.includes(command) && typeof b.call_id === 'string') calls.set(b.call_id, command);
  }
  const output = new Map<string, {payload: unknown; eventId: string; queriedAt: string}>();
  for (const e of events) if (e.type === 'tool_call_output' && e.role === 'tool' && !e.is_error) for (const b of blocks(e)) {
    const command = calls.get(String(b.call_id));
    if (!command || output.has(command)) continue;
    let raw = b.output;
    try {
      // Managed Agent serializes bash's stdout/stderr wrapper as a JSON string.
      let payload = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
      const wrapper = object(payload);
      if (wrapper && ('stdout' in wrapper || 'exit_code' in wrapper)) {
        if (wrapper.exit_code !== 0 || wrapper.interrupted === true || typeof wrapper.stdout !== 'string') continue;
        payload = JSON.parse(wrapper.stdout.trim());
      }
      if (!object(payload) || typeof payload.status !== 'number' || !e.created_at || !Number.isFinite(Date.parse(e.created_at))) continue;
      output.set(command, {payload, eventId: e.id, queriedAt: e.created_at});
    } catch { /* A summary or truncated JSON is not a provider quote. */ }
  }
  return output;
}
// Inspect only outputs paired with planned bash calls. Never hide an upstream
// refusal behind a later duplicate-command error, and never retry risk controls.
export function travelFailure(events: AgentEvent[], commands: string[]) {
  const ids = new Set(events.filter(e => e.type === 'tool_call').flatMap(blocks).filter(b => b.name === 'bash' && commands.includes(commandFrom(b) || '')).map(b => b.call_id));
  for (const event of events.filter(e => e.type === 'tool_call_output')) for (const b of blocks(event)) {
    if (!ids.has(b.call_id)) continue;
    let output = b.output;
    try { if (typeof output === 'string') output = JSON.parse(output); } catch { continue; }
    const o = object(output);
    if (!o || o.exit_code === undefined || (o.exit_code === 0 && !o.interrupted)) continue;
    if (/HTTP 451|risk control|Abnormal access/i.test(String(o.stderr))) return {code:'TRAVEL_RISK_CONTROL', message:'飞猪旅行数据服务暂时限制了查询，已停止本轮调用和自动重试。请稍后再试；持续出现时需联系飞猪恢复访问。'};
    if (/429|rate.limit/i.test(String(o.stderr))) return {code:'TRAVEL_RATE_LIMIT', message:'飞猪查询频率受限，已停止本轮调用，请稍后再试。'};
    return {code:'TRAVEL_TOOL_FAILED', message:'旅行数据查询未完成，已停止本轮调用；没有用估算数据补齐。'};
  }
  return null;
}
export function extractAgentJSON(events: AgentEvent[]): unknown {
  const messages = events.filter(e => e.type === 'message' && e.role === 'assistant');
  const last = messages.at(-1);
  const text = (last?.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
  try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { throw new AppError('AGENT_RESPONSE', '云端智能体未返回可验证的结构化结果，当前条件已保留。'); }
}
export function validatePolicy(session: Record<string, unknown>, usesTools: boolean) {
  const tools = object(session.agent)?.tools;
  if (!Array.isArray(tools)) throw new AppError('AGENT_POLICY', '无法核实云端工具权限，请检查智能体配置。');
  let bash = false;
  for (const item of tools) {
    const toolkit = object(item); if (!toolkit) continue;
    const defaults = object(toolkit.default_config);
    if (defaults?.enabled !== false) throw new AppError('AGENT_POLICY', '云端工具需默认关闭，并为 bash 开启逐次确认。');
    const configs = Array.isArray(toolkit.configs) ? toolkit.configs : [];
    for (const value of configs) {
      const c = object(value); if (!c?.enabled) continue;
      if (!usesTools) throw new AppError('AGENT_POLICY', '文字智能体不可启用工具，请检查云端配置。');
      if (toolkit.type !== 'builtin_toolkit' || c.name !== 'bash' || object(c.permission_policy)?.type !== 'always_ask') throw new AppError('AGENT_POLICY', '当前云端工具权限与旅行查询协议不符，请仅启用需要确认的 bash。');
      bash = true;
    }
  }
  if (usesTools && !bash) throw new AppError('AGENT_POLICY', '云端未启用可确认的旅行查询工具。');
}
type Dependencies = { fetch: typeof fetch; sleep: (ms: number) => Promise<unknown>; now: () => number; reserve: (provider:'flyai'|'bailian')=>void | Promise<void> };
export async function runManagedTask(input: { purpose: string; prompt: string; commands?: string[] }, supplied?: { config: AgentConfig; dependencies: Dependencies; timeoutMs?: number }) {
  const commands = input.commands || [];
  const config = supplied?.config || agentConfig(commands.length > 0);
  if (!validAgentBase(config.base)) throw new AppError('INVALID_CONFIG', 'Managed Agent 地址无效');
  const d = supplied?.dependencies || { fetch: (...args: Parameters<typeof fetch>) => fetch(...args), sleep: pause, now: Date.now, reserve: reserveCall };
  const deadline = d.now() + (supplied?.timeoutMs || 240_000);
  let requestCount = 0;
  const maxRequests = Number(process.env.MANAGED_AGENT_MAX_REQUESTS || 500);
  const pollMs = Number(process.env.MANAGED_AGENT_POLL_MS || 1500);
  let sessionId: string | undefined;
  let finished = false;
  const events = new Map<string, AgentEvent>();
  const approved = new Set<string>();
  const usedCommands = new Set<string>();
  async function request(path: string, body?: unknown, cleanup = false): Promise<Record<string, unknown>> {
    if (!cleanup && ++requestCount > maxRequests) throw new AppError('AGENT_QUERY_LIMIT', '本轮云端查询已达到运行上限，已请求停止任务；请缩小候选城市范围再试。');
    if (!cleanup && d.now() >= deadline) throw new AppError('AGENT_TIMEOUT', '云端查询超时，已请求停止任务，请稍后重试。');
    let response: Response;
    try { response = await d.fetch(config.base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: AbortSignal.timeout(cleanup ? 5000 : Math.max(1, Math.min(20_000, deadline - d.now()))), headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) }); }
    catch (error) {
      const name = error instanceof Error ? error.name : 'Unknown';
      let detail = error instanceof Error ? error.message : '';
      for (const secret of [config.key, config.travelKey]) if (secret) detail = detail.split(secret).join('[REDACTED]');
      console.warn(JSON.stringify({event:'agent_network_failure', name, detail:detail.replace(/https?:\/\/[^\s]+/g,'[upstream]').slice(0,250)}));
      throw new AppError('AGENT_NETWORK', '云端智能体连接中断，未自动重复提交任务。'); }
    let text = await response.text();
    if (text.length > 8_000_000) throw new AppError('AGENT_RESPONSE', '云端返回过大，无法完整核验');
    // Never persist a credential accidentally echoed by the upstream runtime.
    for (const secret of [config.key, config.travelKey]) if (secret) text = text.split(secret).join('[REDACTED]');
    let data: Record<string, unknown>;
    try { data = object(JSON.parse(text)) || {}; } catch { throw new AppError('AGENT_RESPONSE', '云端返回格式无法核验'); }
    if (!response.ok) {
      if (billingError(data)) throw new AppError('AGENT_BILLING', '百炼账户余额或计费状态异常，云端任务未完成。');
      if (data.code === 'AccessDenied.Unpurchased') throw new AppError('AGENT_ACCESS', '百炼尚未允许此托管接口调用，请检查账户开通状态和专用凭据权限；当前未完成云端任务。');
      if ([401,403].includes(response.status)) throw new AppError('AGENT_AUTH', '百炼凭据或智能体访问权限未通过验证。');
      throw new AppError('AGENT_UPSTREAM', '百炼 Managed Agent 暂未完成请求，请稍后重试');
    }
    return data;
  }
  async function collect() {
    let page: string | undefined;
    const cursors = new Set<string>();
    do {
      const data = await request(`/sessions/${sessionId}/events?limit=100&order=asc${page ? '&page='+encodeURIComponent(page) : ''}`);
      if (!Array.isArray(data.data)) throw new AppError('AGENT_RESPONSE', '云端事件记录不完整');
      for (const e of data.data) if (typeof e?.id === 'string' && typeof e?.type === 'string') events.set(e.id, e);
      if (events.size > 2000) throw new AppError('AGENT_RESPONSE', '云端事件过多，停止核验');
      page = typeof data.next_page === 'string' && data.next_page ? data.next_page : undefined;
      if (page && cursors.has(page)) throw new AppError('AGENT_RESPONSE', '云端事件分页重复');
      if (page) cursors.add(page);
    } while (page);
    checkAgentError([...events.values()]);
  }
  await d.reserve('bailian');
  try {
    const session = await request('/sessions', { agent: config.agentId, environment_id: config.environmentId, title: `中点见 · ${input.purpose}`, metadata: { product: 'zhongdianjian', task: input.purpose }, ...(commands.length ? config.travelKey ? {environment_variables:{FLYAI_API_KEY:config.travelKey}} : {vault_ids: [config.vaultId]} : {}) });
    if (typeof session.id !== 'string' || !/^sesn_[A-Za-z0-9]+$/.test(session.id)) throw new AppError('AGENT_RESPONSE', '百炼未返回有效会话');
    sessionId = session.id;
    validatePolicy(session, commands.length > 0);
    await request(`/sessions/${sessionId}/events`, {input: [{type:'message',role:'user',content:[{type:'text',text:input.prompt}]}]});
    while (d.now() < deadline) {
      const state = await request(`/sessions/${sessionId}`);
      await collect();
      const warning = commands.length ? travelFailure([...events.values()], commands) : null;
      if (warning) return {events:[...events.values()], warning, proof:{engine:'bailian-managed-agent' as const,sessionId,agentId:config.agentId,eventIds:[...events.values()].filter(e=>e.type==='tool_call_output').map(e=>e.id)}};
      const stop = object(state.stop_reason);
      if (state.status === 'terminated') throw new AppError('AGENT_TERMINATED', '云端会话已终止，请重新查询');
      if (state.status === 'idle' && stop?.type === 'requires_action') {
        const pending = stop.pending_call_ids;
        const batch = stop.pending_batch_id;
        if (typeof batch !== 'string' || !Array.isArray(pending) || !pending.length) throw new AppError('AGENT_RESPONSE', '工具确认状态不完整');
        const decisions = [];
        for (const callId of pending) {
          const approvalKey = `${batch}:${callId}`;
          if (approved.has(approvalKey)) continue;
          const match = [...events.values()].filter(e => e.type === 'tool_approval_request').flatMap(blocks).find(b => b.batch_id === batch && b.call_id === callId);
          const command = match ? commandFrom(match) : null;
          if (!match || match.tool_type !== 'builtin' || match.name !== 'bash' || !command || !commands.includes(command) || usedCommands.has(command)) throw new AppError('AGENT_TOOL_REJECTED', '智能体请求了计划外的操作，已停止云端任务。');
          await d.reserve('flyai'); usedCommands.add(command); approved.add(approvalKey);
          decisions.push({type:'tool_approval_response',role:'user',content:[{type:'data',data:{batch_id:batch,call_id:callId,result:'allow'}}]});
        }
        if (decisions.length) await request(`/sessions/${sessionId}/events`, {input:decisions});
      } else if (state.status === 'idle' && stop?.type === 'end_turn') {
        finished = true;
        const all = [...events.values()];
        return { events: all, proof: {engine:'bailian-managed-agent' as const,sessionId,agentId:config.agentId,eventIds:all.filter(e=>['message','tool_call_output'].includes(e.type)).map(e=>e.id)} };
      } else if (state.status === 'idle' && stop?.type) throw new AppError('AGENT_EXECUTION', '云端任务未正常完成，请检查百炼会话记录');
      await d.sleep(pollMs);
    }
    throw new AppError('AGENT_TIMEOUT', '云端查询超时，已请求停止任务，请缩小候选城市范围后重试。');
  } finally {
    if (sessionId && !finished) {
      try { await request(`/sessions/${sessionId}/events`, {input:[{type:'interrupt',role:'user'}]}, true); } catch { /* Request attempted; never claim confirmed cancellation. */ }
    }
  }
}
