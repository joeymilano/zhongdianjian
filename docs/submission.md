## 参赛项目名称

**中点见 · 同城与跨城的公平会合助手**（自由方向）

### 各自出发，在中点见。

同城的一杯咖啡，跨城的一个周末。中点见把每个人的时间、预算和路线放在一起，让一场相聚更容易成行。

**2–4 人共同决策 · 同城与跨城 · 三种方案比较 · 百炼 Managed Agent**

![中点见首页，微缩列车与水乡相聚场景](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/home.jpg)

[立即体验中点见](https://zhongdianjian.super666joey.workers.dev)

## 团队 / 作者与奖品领取人

- 团队名称：中点见
- 主要提交人 GitHub ID：joeymilano
- 个人参赛

## 旅行场景与目标用户

朋友约见面，常常卡在选地方。有人住得远，有人预算紧，有人周日得早点回家。各自查完路线，再到群里凑时间，一轮讨论下来还没定好去哪儿。

中点见帮 2–4 位朋友一起选见面地点。既考虑异地亲友的周末往返，也考虑同一座城市里的长距离出行。希望每次相聚，都能少让某一个人迁就。

## 我做了什么

中点见提供同城和跨城两种会合方式，可以直接[打开网页体验](https://zhongdianjian.super666joey.workers.dev)。

跨城见面时，填写每个人的出发城市、时间和往返预算，选择想去的候选城市。中点见查询飞猪车次，筛出符合所有人条件的组合，再给出三种方案。

| 方案 | 怎样选 |
|---|---|
| 少一点迁就 | 让往返乘车最久的那个人，尽量少花时间在路上 |
| 少一点花费 | 让所有人的往返交通费合计最低 |
| 多一点相聚 | 让大家在目的地共同停留的时间最长 |

每套方案都能展开查看各自的车次、路费和乘车时间。选定城市后，还可以查看酒店并跳转飞猪预订。

大家也可以直接用文字提出要求。临时改时间或预算时，核对修改内容后重新计算；如果条件凑不到一起，页面会说明卡在哪个人、哪项要求上。

同城碰面时，先搜索并确认大家的出发地点，再比较咖啡店等候选地点。可以选择公交、步行或驾车，看到每个人预计要走多久。地点即使看着在地图中央，也要按实际路线算过才知道是否合适。

中点见把目的地决策提前到出行的第一步。先让大家知道谁要多坐一小时车、谁会超预算，再一起选择。百炼负责理解条件和调用旅行工具，飞猪提供车次与酒店，高德计算同城路线，从一句“我们见个面吧”一直帮到选车、选酒店。

## 百炼使用说明（必填）

- **百炼能力 / 模型** 使用阿里云百炼 Managed Agent，模型为 Qwen3.8-Flash。
- **调用方式** 网页服务端通过 Managed Agent API 创建会话，提交任务并读取工具执行结果。
- **使用环节与输入输出** 文字 Agent 把用户的话整理成待确认的出行条件；旅行 Agent 查询车次和酒店。程序根据查询结果计算费用、检查时间并排列方案，文字 Agent 辅助说明取舍。
- **Skill 名称** 使用[飞猪官方 FlyAI Skill](https://github.com/alibaba-flyai/flyai-skill)，通过 `search-train` 和 `search-hotel` 获取旅行数据。
- **其他工具 / 技术栈** Next.js、React、TypeScript、Cloudflare Workers / D1；同城地点搜索和路线规划使用高德 Web 服务。

## 效果展示

### 把大家的安排，放在同一张桌上

每位朋友都有自己的条件卡片，出发时间、回家时间和预算分别设置。右侧会合示意把不同起点连到一起，谁从哪里来，一眼就能看清。

![多人条件卡片与会合示意](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/planner.jpg)

### 少赶路、少花费、多相聚，选择看得见

三种方案分别回答三个实际问题。有人更怕路上折腾，有人更在意预算，也有人想多待一会儿，大家可以直接比较。

![三种会合目标的产品展示](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/goals.jpg)

以下为 10 月 8–9 日的查询截图，使用演示行程。价格和预计用时以查询当时为准。

### 北京、天津出发，在济南见

两人计划 10 月 10 日出发、11 日返回，往返预算各 800 元。查询后可以按各自更在意的事情来选。

| 方案 | 查询结果 |
|---|---|
| 少一点迁就 | 最长个人往返乘车 3 小时 6 分，全组交通费 690 元 |
| 少一点花费 | 全组往返交通费 559.5 元 |
| 多一点相聚 | 共同停留 19 小时 47 分 |

![北京、天津到济南的三种会合方案](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/cross-city.png)

### 上海徐家汇、五角场出发，找家咖啡店

确认两个地铁站后，比较 3 家候选咖啡店的公交路线。排名第一的是口袋叮咚七浦路店，两人预计分别需要 35 分钟和 33 分钟，公交票价估计各 4 元。

![徐家汇与五角场出发的公交会合结果](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/same-city.png)

### 定好见面城市，顺手安排住一晚

选定目的地后，接着查看飞猪返回的酒店图片、位置和搜索报价。截图展示杭州的住宿查询，通过预订入口即可前往飞猪核对房型并预订。

![杭州酒店推荐与飞猪预订入口](https://raw.githubusercontent.com/joeymilano/zhongdianjian/main/docs/screenshots/hotels.jpg)

跨城目前支持两天一夜的直达铁路出行，在用户选定的候选城市和返回车次中比较。共同停留时间包含夜间，市内接驳和住宿费另计。同城比较的是所选地点的单程预计用时。

## 项目链接与复现方式

- [在线体验](https://zhongdianjian.super666joey.workers.dev)
- [代码与运行说明](https://github.com/joeymilano/zhongdianjian)
- [Managed Agent 配置说明](https://github.com/joeymilano/zhongdianjian/blob/main/docs/architecture.md)

打开网页即可使用。跨城可以试试北京、天津出发，在济南见面，选择未来可售日期并填写每个人的条件。首次建议选 1–3 个候选城市，查询可能需要几分钟。同城可以用徐家汇、五角场地铁站作为起点，搜索咖啡店后比较路线。

本地运行需要 Node.js 22+。执行 `npm ci`，将 `.env.example` 复制为 `.env.local`，填入自己的百炼 Managed Agent、FlyAI 和高德配置，再执行 `npm run dev`。在浏览器打开 `http://127.0.0.1:3088` 即可。
