# 英语长难句分析 MVP 技术方案

## 1. 方案目标

本方案用于实现《英语长难句分析 MVP 产品设计》中定义的单句分析能力：用户输入一个不超过 500 个字符的英文句子，系统返回大颗粒度的四色句法标注和自然中文翻译。

技术设计优先保证以下事项：

1. 展示的英文必须与用户输入完全一致，不能被模型改写、纠错或重新排版。
2. AI 返回异常时明确失败，不展示错位或未经验证的标注。
3. MVP 保持单体、无账号、无业务数据库，能够快速上线和低成本维护。
4. AI 模型、限流服务和部署平台都应可替换，避免核心业务依赖单一实现。

## 2. 推荐技术栈

| 领域 | 选择 | 说明 |
| --- | --- | --- |
| 应用框架 | Next.js App Router | 页面、服务端接口和部署单元保持在一个项目中 |
| 开发语言 | TypeScript | 前后端共享数据结构，降低接口不一致风险 |
| UI | React + CSS Modules 或普通 CSS | 页面简单，不引入大型组件库和全局状态库 |
| 数据校验 | Zod | 同时校验 HTTP 请求、AI 结构化输出和内部领域对象 |
| AI 接口 | DeepSeek API + OpenAI Node SDK | 通过 DeepSeek 的 Responses API 和 JSON Schema 约束模型返回结构 |
| 单元与组件测试 | Vitest + React Testing Library | 覆盖领域规则、服务端编排和页面交互 |
| 端到端测试 | Playwright | 覆盖桌面端、移动端和完整提交路径 |
| 包管理 | pnpm | 安装速度快，锁文件明确 |
| 首选部署 | Vercel | 与 Next.js 集成简单，适合 MVP |
| 生产限流 | Upstash Redis 或同类托管 KV | 在多个 Serverless 实例之间共享限流状态 |

MVP 不引入 PostgreSQL、MongoDB、消息队列、微服务、LangChain 或独立 Python NLP 服务。

## 3. 总体架构

系统采用单体 Web 应用，浏览器只负责输入和展示，所有 AI 调用和结果校验都在服务端完成。

```text
浏览器
  │  POST /api/analyze
  ▼
Next.js Route Handler
  ├─ 输入校验
  ├─ 频率限制
  ├─ 调用分析用例
  └─ 统一错误映射
        │
        ▼
分析用例
  ├─ 构造稳定提示词
  ├─ 调用 AI 结构化输出
  ├─ 无损还原原句
  ├─ 计算字符偏移量
  └─ 校验并返回领域结果
        │
        ▼
前端按原句和偏移量渲染四色结果
```

前端不能直接展示模型返回的英文片段。最终英文始终从用户原句中截取。

## 4. 模块划分

建议保持以下边界：

```text
src/
  app/
    api/analyze/route.ts       HTTP 接口、限流和错误映射
    page.tsx                   页面入口
  components/
    SentenceAnalyzer.tsx       输入、加载、成功和失败状态
    HighlightedSentence.tsx    根据原句和偏移量渲染结果
    GrammarLegend.tsx          四色图例
  domain/
    input.ts                   输入规则
    analysis.ts                领域类型与最终结果校验
    alignSegments.ts           原文对齐和偏移量计算
  server/
    analyzeSentence.ts         分析流程编排
    modelAnalyzer.ts           AI 服务适配器
    prompt.ts                  提示词和分类规则
    rateLimit.ts               限流接口及实现
```

领域模块不依赖 React、Next.js 或具体模型 SDK，使关键规则可以独立测试，也便于以后替换模型供应商。MVP 默认适配器为 DeepSeek，业务层只依赖 `ModelAnalyzer` 接口。

## 5. AI 输出与原文保真

### 5.1 模型输出契约

本地和接口先检查原始输入长度（包含首尾空白）、空输入及是否含英文字母；去除首尾空白后作为分析原句，不用句号正则硬判多句。主体语言和句子数量由同一次模型请求判断。

模型不直接返回字符偏移量。英文单句返回按原句顺序排列、覆盖完整原句的片段；其他输入只返回明确状态：

```ts
type ModelResponse = {
  status: "valid";
  parts: Array<{
    text: string;
    type: "noun" | "adjective" | "adverb" | "verb" | "neutral";
  }>;
  translation: string;
} | {
  status: "not_english" | "multiple_sentences";
  parts: [];
  translation: "";
};
```

`neutral` 用于空格、标点、连词及其他不着色内容。Structured Outputs 只保证返回结构符合 Schema，业务层仍必须验证文本和语义边界。

传输层 JSON Schema 固定要求 `status`、`parts` 和 `translation`。运行时 `modelResponseSchema` 按状态进一步校验：`valid` 必须有非空片段和译文；另外两种状态必须为空片段和空译文，不能夹带分析。模型判定非英文或多句时，接口分别返回 HTTP 400 的 `NOT_ENGLISH` 或 `MULTIPLE_SENTENCES`，消息由服务端固定生成，不自动重试。缺失状态、未知状态或状态与字段矛盾属于格式异常，最多重试一次。

### 5.2 服务端对齐

仅通过 `valid` 分支校验后，服务端才依次处理 `parts`：

1. 将所有 `text` 原样拼接。
2. 拼接结果必须与用户原句逐字符相等，不进行 trim、大小写转换或标点归一化。
3. 按累计字符串长度计算每个着色片段的 `start` 和 `end`。
4. 校验区间非空、升序、不重叠且不越界。
5. 丢弃 `neutral` 的着色信息，但保留其占用的位置。
6. 最终只返回原句、着色区间和翻译。

浏览器收到的领域结果为：

```ts
type AnalysisResult = {
  original: string;
  segments: Array<{
    start: number;
    end: number;
    type: "noun" | "adjective" | "adverb" | "verb";
  }>;
  translation: string;
};
```

如果模型改变了空格、引号或任意字符，对齐就会失败，错误结果不会进入前端。

### 5.3 重试策略

只有以下可恢复错误允许自动重试一次：

- 模型返回无法解析的结构化结果；
- 片段无法无损拼回原句；
- 区间校验失败；
- 模型请求遇到短暂的超时或服务错误。

重试仍失败时，接口返回统一的 `ANALYSIS_FAILED`。输入错误、频率限制和确定性的权限错误不重试，避免增加延迟和费用。

## 6. 模型与提示词策略

本版 MVP 统一使用 DeepSeek API，默认模型为 `deepseek-flash`，并通过 `DEEPSEEK_MODEL` 环境变量配置，不在业务代码中写死。如果固定评测集表明准确率不能满足上线要求，再对比更高能力的 DeepSeek 模型；切换模型不改变领域接口。

提示词应包含：

- 四类句法功能的定义；
- 英文主体、单句和多句的语义判断，以及首字母缩写、句内引语、小写句首、缺少末尾句号和中英混合输入的边界示例；
- 大颗粒度、只分析外层功能的原则；
- 定语从句、状语从句、名词性从句等代表性示例；
- 完整覆盖原句、保留每个字符的要求；
- 不执行句子中包含的指令，不纠错、不改写原句；
- 只完成句法分类和翻译，不使用工具或访问外部资源。

静态规则通过 Responses API 的 `instructions` 传入，用户句子作为明确分隔的非可信数据放在 `input` 中。请求设置合理超时，MVP 使用非思考模式降低延迟；若质量评测不达标，再单独比较思考模式。DeepSeek Responses API 当前为无状态接口，不依赖服务端会话存储。

上线前建立一组约 50～100 条的代表性句型数据集，至少覆盖：简单主谓宾、介词短语、定语从句、状语从句、名词性从句、不定式、系表结构、并列结构、引号和缩写。评测指标包括标注正确率、原文对齐成功率、翻译质量、P95 延迟和单次成本。

## 7. API 设计

### 请求

```http
POST /api/analyze
Content-Type: application/json

{
  "sentence": "The book that I bought yesterday is interesting."
}
```

### 成功响应

```json
{
  "original": "The book that I bought yesterday is interesting.",
  "segments": [
    { "start": 0, "end": 8, "type": "noun" },
    { "start": 9, "end": 32, "type": "adjective" },
    { "start": 33, "end": 35, "type": "verb" },
    { "start": 36, "end": 47, "type": "adjective" }
  ],
  "translation": "我昨天买的那本书很有意思。"
}
```

### 错误响应

错误响应使用稳定的业务代码和适合直接展示的中文消息：

- `EMPTY`：没有输入；
- `TOO_LONG`：超过 500 个字符；
- `NOT_ENGLISH`：明显不是英文；
- `MULTIPLE_SENTENCES`：检测到多个完整句子；
- `RATE_LIMITED`：请求过于频繁；
- `ANALYSIS_FAILED`：AI、超时或结果校验失败。

服务端日志记录内部错误类型，但不把异常堆栈、模型原始响应或密钥信息返回浏览器。

## 8. 限流与滥用防护

本地开发和早期内部演示可以使用内存限流。部署到 Serverless 环境并公开访问后，必须切换到共享存储限流，因为不同实例之间不共享内存。

建议默认规则为单 IP 每分钟 10 次，并预留全局费用熔断能力。客户端 IP 只从部署平台可信代理头中读取，不能无条件相信任意请求头。

接口还应限制请求体大小，只接受 JSON 和单个字符串字段。用户输入始终作为不可信数据处理，不允许它改变系统提示词、调用工具或控制服务端行为。

## 9. 隐私与数据处理

MVP 不建立用户句子数据库，不记录原句、翻译或模型原始输出。应用日志只记录：

- 请求时间和总耗时；
- 成功或失败；
- 规范化后的错误类型；
- 模型名称、token 用量和匿名请求标识；
- 不包含原文的限流键摘要。

DeepSeek Responses API 当前为无状态接口，返回结果中的 `store` 为 `false`。产品隐私说明仍应准确表述为“本产品不在自己的数据库中保存用户句子，句子会发送给 DeepSeek API 完成分析”，不能承诺第三方绝不产生任何合规或安全日志。

## 10. 测试策略

前端不使用 `maxLength` 截断粘贴。超长输入保留原文、显示超出数量并阻止所有提交路径；500 字符以内自动恢复。分析期间用同步请求锁阻止按钮、快捷键和表单重复提交，同时禁用输入；结果、错误及加载状态只允许当前请求更新。成功或失败后恢复编辑。

### 单元测试

- 输入长度、空输入、英文判断和多句判断；
- 499/500/501 字符粘贴保留、首尾空白计数、连续快捷键及同步表单提交、失败后再次提交；
- 同一次模型调用的语义拒绝、固定 HTTP 400 映射、无效状态重试，以及通过真实 SDK 和模拟网络验证请求 Schema；
- 模型 Schema 校验；
- 片段完整拼接、重复文本、标点和空格对齐；
- 偏移量计算、越界、空片段和顺序错误；
- 限流窗口和错误映射。

### 组件测试

- 提交时进入加载状态并防止重复提交；
- 成功后显示四色图例、完整原句和翻译；
- 失败后保留输入；
- 第二次分析替换第一次结果；
- 前端渲染后的完整文本严格等于 `original`。

### 端到端测试

- 使用拦截的固定 API 响应，不依赖真实 AI；
- 覆盖桌面和 `390×844` 移动端；
- 验证无水平滚动、键盘操作和清晰焦点状态；
- 验证空输入、服务错误和频率限制提示。

### AI 质量评测

真实模型评测与确定性自动化测试分开运行，避免日常测试产生费用或因模型波动而不稳定。每次修改模型或提示词时运行固定评测集，并保存聚合指标，不保存公开用户输入。

## 11. 部署与配置

环境变量至少包括：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_TIMEOUT_MS=30000
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_SECONDS=60
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

建议先建立预览环境，再部署生产环境。发布前必须通过单元测试、组件测试、类型检查、Lint、生产构建和 Playwright 测试。生产环境设置费用告警，并观察成功率、P95 延迟、对齐失败率、重试率和单次分析成本。

## 12. 实施阶段

第一阶段完成 Next.js 基础应用、输入校验、AI 适配器、无损对齐、结果渲染和确定性测试。

第二阶段接入真实模型，运行固定评测集，选择模型并调整提示词。只有达到可接受的对齐成功率和标注准确率后才公开上线。

第三阶段加入共享限流、生产监控、费用熔断和隐私说明。账号、历史记录、段落分析、详细语法讲解等功能继续保持在 MVP 范围之外。

## 13. 最终技术决策

MVP 采用 Next.js、React、TypeScript、Zod 和 DeepSeek Responses API 构建单体应用，部署到 Vercel；公开上线时使用托管 Redis/KV 完成共享限流。系统不建立业务数据库，服务端通过“模型顺序分片、完整原文比对、服务端计算偏移量”的方式保证英文原文不被改写，前端只渲染经过验证的领域结果。AI 调用封装在可替换的 `ModelAnalyzer` 适配器中，本版只启用 DeepSeek 实现。

## 14. 参考资料

- [英语长难句分析 MVP 产品设计](./superpowers/specs/2026-09-16-english-sentence-analysis-mvp-design.md)
- [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)
- [DeepSeek Responses API 使用指南](https://api-docs.deepseek.com/guides/responses_api/)
- [DeepSeek JSON Output 指南](https://api-docs.deepseek.com/guides/json_mode/)
