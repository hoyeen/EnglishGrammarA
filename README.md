# 句析 · 英语长难句分析

一个面向英语学习者的响应式单页应用：粘贴一个不超过 500 字符的英文句子，获得大颗粒度的四色句法功能标注和自然中文翻译。

## 四色含义

- 粉色：名词性成分
- 黄色：形容词性成分
- 绿色：副词性成分
- 紫色：动词

标注说明片段在整句中的整体功能，不等同于逐词词性分析。英文结果始终从用户原句按服务端验证后的偏移量切片，模型改写、漏字或错位时不会展示结果。

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

未配置 Upstash 时使用进程内限流，只适合本地开发和单实例演示。公开部署到 Serverless 前应同时配置两个 Upstash 变量。

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

## 隐私

应用不建立用户句子数据库，也不在自己的业务日志中记录原句、翻译或模型原始输出。句子会发送给 DeepSeek API 完成分析；第三方服务可能依据其自身条款产生必要的合规或安全日志。限流使用经过摘要处理的客户端标识。

## MVP 边界

本期不包含账号、历史记录、段落/文章分析、详细语法讲解、练习课程或 AI 追问。
