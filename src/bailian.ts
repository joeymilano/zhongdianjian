import { isBailianEndpoint } from './bailian-endpoint.js';
import './config.js';
export async function probeBailian() {
  const key = process.env.DASHSCOPE_API_KEY?.trim();
  if (!key) return { state: 'missing_key', message: '尚未配置 DASHSCOPE_API_KEY；没有发起模型调用' };
  const base = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  if (!isBailianEndpoint(base)) throw new Error('验证程序仅允许中国内地百炼官方接口');
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.DASHSCOPE_MODEL || 'qwen-plus', max_tokens: 32, temperature: 0, enable_thinking: false,
        messages: [{ role: 'user', content: '这是连通性验证。只回复：连接成功。' }] }),
    });
    if (!response.ok) return { state: 'upstream_error', httpStatus: response.status, message: '百炼未成功返回；未记录密钥和原始错误内容' };
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return { state: typeof content === 'string' && content.length ? 'connected' : 'invalid_response',
      model: data.model, usage: data.usage, message: typeof content === 'string' && content.length ? '百炼已返回内容' : '百炼未返回文本' };
  } catch { return { state: 'connection_error', message: '百炼网络连接失败或超时' }; }
}
