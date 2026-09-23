# 点词查询 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Execute inline in the existing workspace; preserve unrelated staged changes.

**Goal:** 已分析句子中的单词支持鼠标、触屏和键盘查询本句中文义与有依据的 IPA，支持降级、重试和页面缓存。

**Architecture:** 共享域层负责 UTF-16 单词范围和请求／响应契约；服务端独立组合词典、模型及限流；客户端通过有界会话缓存与可取消请求驱动浮窗。服务端密钥不进入客户端，实验脚本不被应用导入。

**Tech Stack:** 现有 Next.js、React、Zod、OpenAI SDK、Vitest、Playwright；不新增依赖。已核对本地 Next.js Route Handlers 与 Client Components 文档，使用当前已验证的供应商契约。

## 1. 域契约与缓存

- [x] 新增 `src/domain/word.ts`、`src/domain/ttlCache.ts`，测试 `tests/domain/word.test.ts`、`tests/domain/ttlCache.test.ts`。
- [x] 先测试 `wordRequestSchema.safeParse({sentence:"I saw a saw.",word:"saw",start:8,end:11}).success === true`，而词内片段、错误坐标、超长词、额外字段失败。验证撇号、连字符、UTF-16 和纯标点。
- [x] 新增有界 LRU+TTL 缓存，用可注入时钟验证过期、淘汰、命中刷新顺序。

## 2. 服务端

- [x] 新增 `src/server/wordDictionary.ts`，测试候选关联、响应校验、词典缓存、网络／429／预算耗尽降级；仅合法 Wiktionary 与许可链接可返回客户端。
- [x] 新增 `src/server/wordModel.ts` 和 `src/server/lookupWord.ts`，测试已有候选 ID、未知词、原形同形抑制、错误输出、词典失败仅释义与总取消。
- [x] 在 `src/server/rateLimit.ts` 参数化 Redis 命名空间；新增 `src/server/wordRateLimit.ts`，独立 30 次／分钟客户端限额和 900 次／UTC 小时供应商预算。共享限流不可达时停止词典请求；公开生产缺共享预算时保守仅释义。
- [x] 新增 `src/app/api/word/route.ts` 与接口测试，校验 JSON、字节限制、完整词、取消、限流、固定错误文案。成功返回统一契约，禁止 HTTP 缓存。

## 3. 客户端

- [x] 新增 `src/client/wordLookup.ts`，测试精确原句＋位置键、完整结果 30 分钟、缺 IPA 30 秒、100 项 LRU、同 key 请求合并、失败不缓存、响应身份校验。
- [x] 扩展 `HighlightedSentence.tsx` 的可选点词模式：按全句词范围分块，每个按钮内部叠加颜色片段，`textContent` 严格保持原句；保留无交互模式供原有使用。
- [x] 新增 `WordSentence.tsx` 与 `WordPopover.tsx`，在 `SentenceAnalyzer.tsx` 接入页面级缓存。查询立即加载；请求 ID 与 AbortController 防止切词、关闭、替换结果后的旧响应更新。
- [x] 浮窗在句子区域外，通过 portal 定位；Enter/Space、Esc、关闭按钮、外部点击、焦点恢复、视口边界和手机布局有测试。长词仅提示，不请求接口。

## 4. 交付验证

- [x] 为新增行为先运行失败测试，再实现并验证；执行 `node node_modules/vitest/vitest.mjs run --maxWorkers=2`。
- [x] 执行 Next 类型生成、TypeScript、ESLint、生产构建。新增 `e2e/word.spec.ts` 并回归原有分析用例，在 Edge 验证桌面及 390px 手机、缓存、快速切词、关闭和重新分析；网络拦截不调用模型。
- [x] 对正式接口跑少量固定真实样例，确认供应商与生产适配器连通；不重复整个模型评测集。
- [x] 更新 README、`.env.example`、技术方案和设计状态；审阅差异并提交本次文件，保留原有 `AGENT.md` 与 `.pnpm-store/`。

## 验证记录（2026-09-23）

- Vitest：21 个文件、113 项测试通过；实验脚本的 10 项确定性测试通过。
- Next.js 生产构建、TypeScript 和 ESLint 通过；Edge 浏览器在独立生产服务上验证桌面和 390px 手机交互，9 项测试通过。
- 复核修正了词典 429 冷却、共享请求的独立取消、重试时焦点丢失，以及用户 Tab 离开后结果返回抢焦点，并增加回归测试。
- 正式接口初测发现 `I saw a saw.` 首个 `saw` 一次误判为“锯子”。模型输入增加明确的 before／selected／after 片段后，两个位置各重复 3 次，分别返回“看见”和“锯子”；过去式 `read` 的音标及未知词提示也通过，共 8 次复测。该小样验证证明适配器连通和特定歧义修正，不代表整体语义准确率。
- 词典冷却仅进程内共享；多实例通过 Redis 共享小时预算。缺失可靠词典依据时展示“暂无可靠音标”，不让模型自由生成 IPA。
