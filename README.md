# 句析 · 英语长难句分析

一个面向英语学习者的响应式单页应用：粘贴一个不超过 500 字符的英文句子，获得大颗粒度的四色句法功能标注和自然中文翻译。

## 四色含义

- 粉色：名词性成分
- 黄色：形容词性成分
- 绿色：副词性成分
- 紫色：动词

标注说明片段在整句中的整体功能，不等同于逐词词性分析。英文结果始终从用户原句按服务端验证后的偏移量切片，模型改写、漏字或错位时不会展示结果。

## 点词查询

分析完成后，点击或点按英文结果中的单词，可查看本句中文释义、音标及可选原形。键盘 Tab 定位单词，Enter／Space 打开，Esc 或关闭按钮关闭并返回单词；点击外部也可关闭。

- 查询携带原句和单词位置，因此 `I saw a saw.` 的两个 `saw` 分别解释为“看见”和“锯子”。不重新分析整句。
- 音标取自 [FreeDictionaryAPI.com](https://freedictionaryapi.com/) 的 Wiktionary 候选，模型结合上下文选择。浮窗保留服务、词条及 CC BY-SA 4.0 许可链接。
- 无可靠音标或词典暂时不可用时，可只显示释义及“暂无可靠音标”；允许重试，不让模型编造音标。未知词及模型失败明确提示。
- 同句同位置完整结果缓存 30 分钟，缺音标结果缓存 30 秒，最多 100 项，保存在当前页面内存。刷新后清空。切词、关闭或重新分析后，旧响应不会覆盖当前内容。
- 支持词内撇号和连字符；标点、纯数字不查，超过 80 个字符的单词仅显示提示。
- 浮窗内提供手动“发音”按钮（基于浏览器原生 Web Speech API），支持播放与手动“停止”，不自动播放。优先匹配系统英音（en-GB），若不可用回退至其他英语音色或浏览器默认。开始新播放前清空队列，切词、关闭或重新分析自动停止，15 秒无结束事件自动复位。发音由本地浏览器引擎生成，不保证与上下文音标完全一致；不支持该 API 的环境显示提示。

这是一项增量功能；细粒度语法标注与收藏不在本期。[设计与边界](docs/superpowers/specs/2026-09-22-word-lookup-design.md)和[小样验证记录](docs/experiments/2026-09-23-word-lookup-spike.md)保留了数据覆盖与模型误差的观察。

## 输入与提交

- 超过 500 字符的粘贴会完整保留，并显示超出字符数；缩短到限制以内才能提交。计数包含首尾空白。
- 分析期间锁定输入和提交入口，按钮及 Ctrl/Cmd + Enter 均不能重复发起请求。成功或失败后恢复编辑。
- 本地及接口先检查空输入、长度和是否包含英文字母；英文主体与单句判断由同一次模型调用完成，避免把姓名首字母、缩写或句内引语误判为多句。
- 模型判定非英文或多句时返回明确提示，不自动重试、不展示分析。部分无效输入因此也会产生一次模型调用，受相同限流保护。语言判断仍可能出错，应通过代表性句型持续评测。

## 技术栈

- Next.js App Router、React、TypeScript
- Zod 运行时数据校验
- DeepSeek Responses API（通过 OpenAI Node SDK）
- Vitest、Testing Library、Playwright
- 本地内存限流；生产环境可配置 Upstash Redis 共享限流

## 本地运行

前置条件：Node.js 22、pnpm 10。

```powershell
pnpm install
Copy-Item .env.example .env.local
```

编辑 `.env.local`，至少填写：

```dotenv
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

启动开发服务器：

```powershell
pnpm dev
```

访问 `http://localhost:3000`。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 无 | DeepSeek 服务端密钥，必填 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 分析模型 |
| `DEEPSEEK_TIMEOUT_MS` | `30000` | 单次模型请求超时 |
| `RATE_LIMIT_MAX` | `10` | 每个限流窗口允许的请求数 |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | 限流窗口秒数 |
| `UPSTASH_REDIS_REST_URL` | 无 | 生产共享限流地址 |
| `UPSTASH_REDIS_REST_TOKEN` | 无 | 生产共享限流令牌 |
| `WORD_DICTIONARY_SINGLE_INSTANCE` | `false` | 仅确认为单进程部署时设 `true`，允许生产环境使用进程内词典额度 |

未配置 Upstash 时使用进程内限流，只适合本地开发和单实例演示。公开部署到 Serverless 前应同时配置两个 Upstash 变量。

查词固定独立限额为每客户端每分钟 30 次，不占整句分析额度。词典外部请求采用全应用每 UTC 整点小时 900 次预算，缓存命中不扣额度；词典返回 429 后，当前进程按 `Retry-After`（缺失时至下一 UTC 整点）冷却。冷却不跨实例传播，共享小时预算由 Redis 保护。生产环境未配置共享预算且未声明单进程时，查词保守降级为仅释义；开发模式可使用内存预算。词典服务限额还可能受到同出口其他应用影响。

## 验证

```powershell
pnpm test:run
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

端到端测试会拦截分析 API，不调用真实模型、不产生 AI 费用。

点词端到端测试同样拦截查词 API，覆盖桌面和 390px 触屏、缓存、延迟响应及错误重试。本机安装了 Edge 时可用 `$env:PLAYWRIGHT_CHANNEL='msedge'` 再执行 Playwright；未设置时仍使用 Chromium。

## 隐私

应用不建立用户句子数据库，也不在自己的业务日志中记录原句、翻译或模型原始输出。句子会发送给 DeepSeek API 完成分析；首次点词或缓存失效后，原句、选中词与位置也会发送给 DeepSeek 解释本句词义。词典服务只接收查询词，不接收原句。第三方服务可能依据其自身条款产生必要的合规或安全日志。限流使用经过摘要处理的客户端标识。

## MVP 边界

本期不包含账号、历史记录、段落/文章分析、详细语法讲解、练习课程或 AI 追问。
