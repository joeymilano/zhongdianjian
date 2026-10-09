# Managed Agent 配置与数据边界

## 两个云端 Agent

在百炼 Managed Agent 创建两个使用 Qwen3.8-Flash 的智能体，发布后填写自己的资源 ID：

| Agent | 工具与职责 |
|---|---|
| 旅行 Agent | 挂载[飞猪官方 Skill](https://github.com/alibaba-flyai/flyai-skill)，独立环境预装 `@fly-ai/flyai-cli@1.0.16`。默认工具关闭，仅 bash 开启逐次人工审批，由服务端验证并批准精确命令。负责真实车次与酒店查询。 |
| 文字 Agent | 工具、MCP、Skill 均为空。不接收 FlyAI 凭据。负责条件补丁与结果讨论重点。 |

旅行 Agent 的指令应限定为：逐条执行服务端提供的原始 FlyAI 命令，每条执行一次；禁止合并命令、管道、重定向、读取环境变量、读取文件、安装或输出凭据；空结果和失败时如实结束，不自行重试。服务端会检查真实会话工具配置和每次命令，不依赖提示词保证安全。

## 环境变量

见根目录 `.env.example`。必需：

- `MANAGED_AGENT_BASE_URL`：自己的业务空间 AgentStudio API 地址。
- `MANAGED_AGENT_API_KEY`：有该空间 Managed Agent 调用权限的服务端 Key。
- `MANAGED_AGENT_ID`、`MANAGED_AGENT_TEXT_AGENT_ID`、`MANAGED_AGENT_ENVIRONMENT_ID`：自己发布的两个 Agent 与旅行环境 ID。
- `MANAGED_AGENT_TRAVEL_AUTH=session_env`、`FLYAI_API_KEY`：真实旅行凭据仅通过旅行会话环境变量传入。此模式意味着云端执行环境可读取该 Key，需由部署者明确接受并控制 Agent 和环境访问权限。文字会话从不传入此凭据。
- `AMAP_API_KEY`：自己的高德 Web 服务 Key。公开使用需按自己的账号资格和使用场景确认服务条款及额度。

保留的 Vault 模式不适用于当前 FlyAI CLI 1.0.16 的签名方式；请勿误以为填写 Vault ID 就能运行真实查询。DashScope 变量仅用于旧诊断工具，网页核心不会降级成直连模型。

## 数据如何可信

1. 输入先经模式校验；仅允许合法城市、日期和条件。
2. Managed Agent 创建独立会话，服务端验证工具配置；只批准与预先生成字符串逐字一致的查询命令。
3. 匹配真实 `tool_call` 与 `tool_call_output`，确认命令、调用 ID、退出状态与查询时间。
4. 从供应商 JSON 提取报价；拒绝缺失/脱敏价格、错误城市日期、异常坐席和明确无票的数据。
5. 金额按整数分计算；按 Asia/Shanghai 比较时间。先过滤每位成员硬条件，再按三种目标排序。
6. 比较结果的价格、时间及差额由确定性程序生成；文字 Agent 只选择下一步讨论重点，不能改写数值事实。

## 限制与隐私

旅行结果短时缓存 5 分钟；云端比较记录读取有效期最多 10 分钟，并在后续请求清理到期记录。高德原始响应不做服务端缓存。同城具体地点只保留当前页面内存；跨城条件可保存当前浏览器。所有密钥仅在服务端和授权的旅行执行环境。

D1 原子扣减保守调用预留；全局查询锁及频率限制避免并发重复调用。失败也计入预留，不通过删库或清空记录重置额度。

参考：[Managed Agent API](https://docs.agent.bailian.aliyun.com/en/api/managed-agents/session/create)、[飞猪官方 Skill](https://github.com/alibaba-flyai/flyai-skill)。
