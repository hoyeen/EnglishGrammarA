# 英语长难句分析 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个响应式单页网页，让用户提交一个英文句子后获得四色句法成分标注和自然中文翻译。

**Architecture:** 使用 Next.js App Router 构建单体应用。浏览器只负责输入和展示，`/api/analyze` 完成输入校验、限流、DeepSeek 调用和结果校验；模型返回覆盖完整原句的顺序片段，服务端验证片段可无损拼回原句后自行计算偏移量。领域规则、AI 适配器和 UI 组件保持独立，便于分别测试和替换。

**Tech Stack:** Next.js、React、TypeScript、Zod、DeepSeek Responses API、OpenAI Node SDK、Vitest、Testing Library、Playwright、pnpm

---

## 文件结构

```text
src/
  app/
    api/analyze/route.ts          # HTTP 接口与错误映射
    globals.css                   # 页面与四色视觉样式
    layout.tsx                    # 页面元数据和根布局
    page.tsx                      # 主页面入口
  components/
    SentenceAnalyzer.tsx          # 输入、请求状态和结果编排
    HighlightedSentence.tsx       # 按偏移量渲染四色原句
    GrammarLegend.tsx             # 四色文字图例
  domain/
    analysis.ts                   # 模型输出、领域结果类型和 Zod schema
    alignSegments.ts              # 无损原文对齐和偏移量计算
    input.ts                      # 单句输入校验
  server/
    analyzeSentence.ts            # 分析用例编排
    modelAnalyzer.ts              # AI 接口与 DeepSeek 实现
    prompt.ts                     # 稳定的语法标注提示词
    rateLimit.ts                  # MVP 内存限流
tests/
  api/analyze.test.ts
  components/HighlightedSentence.test.tsx
  components/SentenceAnalyzer.test.tsx
  domain/analysis.test.ts
  domain/alignSegments.test.ts
  domain/input.test.ts
  server/analyzeSentence.test.ts
e2e/analyze.spec.ts
.env.example
playwright.config.ts
vitest.config.ts
vitest.setup.ts
```

### Task 1: 初始化应用与测试工具链

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Test: `tests/smoke.test.tsx`

- [ ] **Step 1: 初始化依赖**

Run:

```bash
pnpm init
pnpm add next@latest react@latest react-dom@latest zod openai
pnpm add -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: `package.json` 和 `pnpm-lock.yaml` 创建成功，安装命令退出码为 0。

- [ ] **Step 2: 配置脚本和测试环境**

将 `package.json` 的脚本设置为：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

在 `vitest.config.ts` 中配置 `jsdom`、`@/` 路径别名和 `vitest.setup.ts`；在 setup 文件中导入 `@testing-library/jest-dom/vitest`。

- [ ] **Step 3: 写失败的页面冒烟测试**

```tsx
// tests/smoke.test.tsx
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

it("shows the sentence analyzer heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "粘贴一个看不懂的英文长句" })).toBeInTheDocument();
});
```

- [ ] **Step 4: 运行测试并确认失败**

Run: `pnpm test:run tests/smoke.test.tsx`

Expected: FAIL，原因是页面尚未包含目标标题。

- [ ] **Step 5: 创建最小页面骨架**

```tsx
// src/app/page.tsx
export default function Home() {
  return (
    <main>
      <h1>粘贴一个看不懂的英文长句</h1>
    </main>
  );
}
```

同时创建有效的根布局并在其中引入 `globals.css`。

- [ ] **Step 6: 验证工具链**

Run: `pnpm test:run tests/smoke.test.tsx && pnpm typecheck && pnpm lint`

Expected: 测试通过，TypeScript 和 ESLint 均无错误。

- [ ] **Step 7: 提交**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts eslint.config.mjs vitest.config.ts vitest.setup.ts src/app tests/smoke.test.tsx
git commit -m "chore: initialize Next.js MVP"
```

### Task 2: 实现输入校验

**Files:**
- Create: `src/domain/input.ts`
- Test: `tests/domain/input.test.ts`

- [ ] **Step 1: 写输入规则测试**

```ts
// tests/domain/input.test.ts
import { describe, expect, it } from "vitest";
import { validateSentenceInput } from "@/domain/input";

describe("validateSentenceInput", () => {
  it("accepts one English sentence", () => {
    expect(validateSentenceInput("The book is interesting.")).toEqual({ ok: true, value: "The book is interesting." });
  });

  it.each([
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    ["这是一个中文句子。", "NOT_ENGLISH"],
    ["He left. She stayed.", "MULTIPLE_SENTENCES"],
    ["a".repeat(501), "TOO_LONG"]
  ])("rejects invalid input %#", (input, code) => {
    expect(validateSentenceInput(input)).toMatchObject({ ok: false, code });
  });

  it("does not treat common abbreviations as a second sentence", () => {
    expect(validateSentenceInput("Dr. Smith arrived early.").ok).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/domain/input.test.ts`

Expected: FAIL，模块 `@/domain/input` 不存在。

- [ ] **Step 3: 实现最小输入校验器**

```ts
// src/domain/input.ts
export type InputErrorCode = "EMPTY" | "TOO_LONG" | "NOT_ENGLISH" | "MULTIPLE_SENTENCES";
export type InputValidation =
  | { ok: true; value: string }
  | { ok: false; code: InputErrorCode; message: string };

const abbreviations = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi;

export function validateSentenceInput(raw: string): InputValidation {
  const value = raw.trim();
  if (!value) return { ok: false, code: "EMPTY", message: "请先输入一个英文句子。" };
  if (value.length > 500) return { ok: false, code: "TOO_LONG", message: "句子不能超过 500 个字符。" };
  if (!/[A-Za-z]/.test(value)) return { ok: false, code: "NOT_ENGLISH", message: "目前仅支持英文句子。" };

  const withoutAbbreviations = value.replace(abbreviations, "");
  const endings = withoutAbbreviations.match(/[.!?](?=\s+[A-Z\"']|$)/g) ?? [];
  if (endings.length > 1) {
    return { ok: false, code: "MULTIPLE_SENTENCES", message: "一次只能分析一个句子。" };
  }
  return { ok: true, value };
}
```

- [ ] **Step 4: 验证并提交**

Run: `pnpm test:run tests/domain/input.test.ts`

Expected: 5 个用例全部通过。

```bash
git add src/domain/input.ts tests/domain/input.test.ts
git commit -m "feat: validate sentence input"
```

### Task 3: 定义模型输出并实现无损原文对齐

**Files:**
- Create: `src/domain/analysis.ts`
- Create: `src/domain/alignSegments.ts`
- Test: `tests/domain/analysis.test.ts`
- Test: `tests/domain/alignSegments.test.ts`

- [ ] **Step 1: 写模型 Schema 和原文对齐测试**

```ts
// tests/domain/analysis.test.ts
import { expect, it } from "vitest";
import { modelAnalysisSchema } from "@/domain/analysis";

it("accepts full ordered parts including neutral text", () => {
  expect(modelAnalysisSchema.parse({
    parts: [
      { text: "She", type: "noun" },
      { text: " ", type: "neutral" },
      { text: "left", type: "verb" },
      { text: ".", type: "neutral" }
    ],
    translation: "她离开了。"
  }).parts).toHaveLength(4);
});
```

```ts
// tests/domain/alignSegments.test.ts
import { expect, it } from "vitest";
import { alignSegments } from "@/domain/alignSegments";

it("computes offsets while preserving neutral text", () => {
  expect(alignSegments("She left.", {
    parts: [
      { text: "She", type: "noun" },
      { text: " ", type: "neutral" },
      { text: "left", type: "verb" },
      { text: ".", type: "neutral" }
    ],
    translation: "她离开了。"
  })).toEqual({
    original: "She left.",
    segments: [
      { start: 0, end: 3, type: "noun" },
      { start: 4, end: 8, type: "verb" }
    ],
    translation: "她离开了。"
  });
});

it("rejects any model rewrite of the original", () => {
  expect(() => alignSegments("She  left.", {
    parts: [
      { text: "She left.", type: "noun" }
    ],
    translation: "她离开了。"
  })).toThrow("model parts do not reproduce original");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/domain/analysis.test.ts tests/domain/alignSegments.test.ts`

Expected: FAIL，领域模块不存在。

- [ ] **Step 3: 实现模型类型、领域结果类型和 Schema**

```ts
// src/domain/analysis.ts
import { z } from "zod";

export const coloredSegmentTypeSchema = z.enum(["noun", "adjective", "adverb", "verb"]);
export const modelPartTypeSchema = z.union([coloredSegmentTypeSchema, z.literal("neutral")]);

export const modelAnalysisSchema = z.object({
  parts: z.array(z.object({
    text: z.string().min(1),
    type: modelPartTypeSchema
  })).min(1),
  translation: z.string().min(1)
});

export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;
export type SegmentType = z.infer<typeof coloredSegmentTypeSchema>;
export type AnalysisResult = {
  original: string;
  segments: Array<{ start: number; end: number; type: SegmentType }>;
  translation: string;
};
```

- [ ] **Step 4: 实现无损对齐和服务端偏移量计算**

```ts
// src/domain/alignSegments.ts
import { modelAnalysisSchema, type AnalysisResult } from "@/domain/analysis";

export function alignSegments(original: string, raw: unknown): AnalysisResult {
  const analysis = modelAnalysisSchema.parse(raw);
  if (analysis.parts.map(part => part.text).join("") !== original) {
    throw new Error("model parts do not reproduce original");
  }

  let cursor = 0;
  const segments: AnalysisResult["segments"] = [];
  for (const part of analysis.parts) {
    const start = cursor;
    cursor += part.text.length;
    if (part.type !== "neutral") segments.push({ start, end: cursor, type: part.type });
  }
  return { original, segments, translation: analysis.translation };
}
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm test:run tests/domain/analysis.test.ts tests/domain/alignSegments.test.ts`

Expected: Schema 和无损对齐测试全部通过。

```bash
git add src/domain/analysis.ts src/domain/alignSegments.ts tests/domain/analysis.test.ts tests/domain/alignSegments.test.ts
git commit -m "feat: align model parts to original sentence"
```

### Task 4: 实现 AI 分析用例

**Files:**
- Create: `src/server/modelAnalyzer.ts`
- Create: `src/server/prompt.ts`
- Create: `src/server/analyzeSentence.ts`
- Create: `.env.example`
- Test: `tests/server/analyzeSentence.test.ts`

- [ ] **Step 1: 写用例编排测试**

```ts
// tests/server/analyzeSentence.test.ts
import { expect, it, vi } from "vitest";
import { analyzeSentence } from "@/server/analyzeSentence";

it("validates model output against the original sentence", async () => {
  const model = vi.fn().mockResolvedValue({
    parts: [
      { text: "She", type: "noun" },
      { text: " ", type: "neutral" },
      { text: "left", type: "verb" },
      { text: ".", type: "neutral" }
    ],
    translation: "她离开了。"
  });
  await expect(analyzeSentence("She left.", model)).resolves.toEqual({
    original: "She left.",
    segments: [
      { start: 0, end: 3, type: "noun" },
      { start: 4, end: 8, type: "verb" }
    ],
    translation: "她离开了。"
  });
});

it("retries once when model parts rewrite the original", async () => {
  const model = vi.fn()
    .mockResolvedValueOnce({
      parts: [{ text: "She left", type: "noun" }],
      translation: "她离开了。"
    })
    .mockResolvedValueOnce({
      parts: [{ text: "She left.", type: "noun" }],
      translation: "她离开了。"
    });
  await expect(analyzeSentence("She left.", model)).resolves.toMatchObject({ original: "She left." });
  expect(model).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/server/analyzeSentence.test.ts`

Expected: FAIL，分析用例不存在。

- [ ] **Step 3: 实现可替换的模型接口和用例**

```ts
// src/server/modelAnalyzer.ts
import OpenAI from "openai";
import { ANALYSIS_PROMPT } from "@/server/prompt";

export type ModelAnalyzer = (sentence: string) => Promise<unknown>;

const modelAnalysisJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    parts: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", minLength: 1 },
          type: { enum: ["noun", "adjective", "adverb", "verb", "neutral"] }
        },
        required: ["text", "type"]
      }
    },
    translation: { type: "string", minLength: 1 }
  },
  required: ["parts", "translation"]
};

export const deepSeekModelAnalyzer: ModelAnalyzer = async (sentence) => {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    timeout: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 30_000)
  });
  const response = await client.responses.create({
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
    instructions: ANALYSIS_PROMPT,
    input: sentence,
    reasoning: { effort: "none" },
    text: {
      format: {
        type: "json_schema",
        name: "sentence_analysis",
        schema: modelAnalysisJsonSchema
      }
    }
  });
  if (!response.output_text) throw new Error("model returned no output");
  return JSON.parse(response.output_text);
};
```

```ts
// src/server/analyzeSentence.ts
import { alignSegments } from "@/domain/alignSegments";
import type { ModelAnalyzer } from "@/server/modelAnalyzer";
import { deepSeekModelAnalyzer } from "@/server/modelAnalyzer";

export async function analyzeSentence(sentence: string, model: ModelAnalyzer = deepSeekModelAnalyzer) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return alignSegments(sentence, await model(sentence));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
```

```ts
// src/server/prompt.ts
export const ANALYSIS_PROMPT = `
你是英语句法分析器。请对用户提交的一个英文句子进行大颗粒度功能分析，并给出自然中文翻译。

只允许四种标注类型：
- noun：在整句中起名词作用的成分
- adjective：在整句中修饰名词或描述主语/宾语的成分
- adverb：在整句中修饰动词、形容词、副词或整句的成分
- verb：谓语中的完整动词片段，包括必要的助动词和系动词

规则：
1. 按成分在外层句子中的整体作用分类，不拆解成分内部的嵌套结构。
2. 定语从句整体标为 adjective，状语从句整体标为 adverb，名词性从句整体标为 noun。
3. parts 必须按顺序覆盖原句的每一个字符，包括所有空格和标点。
4. 连词、标点、空格及不属于四类的连接成分标为 neutral。
5. 所有 parts 的 text 拼接后必须与用户原句逐字符完全相等。
6. 不要纠错、改写、规范化或省略英文原句中的任何字符。

示例：
The book that I bought yesterday is interesting.
=> The book(noun) / 空格(neutral) / that I bought yesterday(adjective) / 空格(neutral) / is(verb) / 空格(neutral) / interesting(adjective) / .(neutral)

She left because she was tired.
=> She(noun) / 空格(neutral) / left(verb) / 空格(neutral) / because she was tired(adverb) / .(neutral)

What he said surprised everyone.
=> What he said(noun) / 空格(neutral) / surprised(verb) / 空格(neutral) / everyone(noun) / .(neutral)
`.trim();
```

- [ ] **Step 4: 添加环境变量示例**

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_TIMEOUT_MS=30000
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm test:run tests/server/analyzeSentence.test.ts && pnpm typecheck`

Expected: 测试及类型检查通过。

```bash
git add src/server .env.example tests/server/analyzeSentence.test.ts
git commit -m "feat: add structured AI sentence analysis"
```

### Task 5: 实现限流和分析 API

**Files:**
- Create: `src/server/rateLimit.ts`
- Create: `src/app/api/analyze/route.ts`
- Test: `tests/api/analyze.test.ts`
- Test: `tests/server/rateLimit.test.ts`

- [ ] **Step 1: 写 API 行为测试**

```ts
// tests/api/analyze.test.ts
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/analyzeSentence", () => ({ analyzeSentence: vi.fn() }));
import { analyzeSentence } from "@/server/analyzeSentence";
import { POST } from "@/app/api/analyze/route";

beforeEach(() => vi.mocked(analyzeSentence).mockReset());

it("returns 400 for invalid input", async () => {
  const response = await POST(new Request("http://local/api/analyze", {
    method: "POST",
    body: JSON.stringify({ sentence: "" })
  }));
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ code: "EMPTY" });
});

it("returns a validated analysis", async () => {
  vi.mocked(analyzeSentence).mockResolvedValue({
    original: "She left.",
    segments: [{ start: 0, end: 3, type: "noun" }, { start: 4, end: 8, type: "verb" }],
    translation: "她离开了。"
  });
  const response = await POST(new Request("http://local/api/analyze", {
    method: "POST",
    body: JSON.stringify({ sentence: "She left." })
  }));
  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/api/analyze.test.ts`

Expected: FAIL，API 路由不存在。

- [ ] **Step 3: 实现每 IP 每分钟 10 次的内存限流器**

```ts
// src/server/rateLimit.ts
const WINDOW_MS = 60_000;
const LIMIT = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consume(ip: string, now = Date.now()): boolean {
  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= LIMIT) return false;
  current.count += 1;
  return true;
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
```

```ts
// tests/server/rateLimit.test.ts
import { beforeEach, expect, it } from "vitest";
import { consume, resetRateLimitsForTests } from "@/server/rateLimit";

beforeEach(resetRateLimitsForTests);

it("allows ten requests and blocks the eleventh", () => {
  for (let request = 0; request < 10; request += 1) expect(consume("127.0.0.1", 0)).toBe(true);
  expect(consume("127.0.0.1", 0)).toBe(false);
});

it("opens a new window after one minute", () => {
  for (let request = 0; request < 10; request += 1) consume("127.0.0.1", 0);
  expect(consume("127.0.0.1", 60_000)).toBe(true);
});
```

- [ ] **Step 4: 实现 API 路由**

```ts
// src/app/api/analyze/route.ts
import { validateSentenceInput } from "@/domain/input";
import { analyzeSentence } from "@/server/analyzeSentence";
import { consume } from "@/server/rateLimit";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_JSON", message: "请求格式不正确。" }, { status: 400 });
  }

  const sentence = typeof body === "object" && body !== null && "sentence" in body
    ? (body as { sentence?: unknown }).sentence
    : "";
  const validation = validateSentenceInput(typeof sentence === "string" ? sentence : "");
  if (!validation.ok) return Response.json(validation, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!consume(ip)) {
    return Response.json({ code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。" }, { status: 429 });
  }

  try {
    return Response.json(await analyzeSentence(validation.value));
  } catch (error) {
    console.error("analysis failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ code: "ANALYSIS_FAILED", message: "分析失败，请重试。" }, { status: 502 });
  }
}
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm test:run tests/api/analyze.test.ts tests/server/rateLimit.test.ts`

Expected: API 与限流测试全部通过。

```bash
git add src/app/api src/server/rateLimit.ts tests/api tests/server/rateLimit.test.ts
git commit -m "feat: expose protected analysis API"
```

### Task 6: 实现四色结果组件

**Files:**
- Create: `src/components/GrammarLegend.tsx`
- Create: `src/components/HighlightedSentence.tsx`
- Test: `tests/components/HighlightedSentence.test.tsx`

- [ ] **Step 1: 写原文保真和中性间隙测试**

```tsx
// tests/components/HighlightedSentence.test.tsx
import { render, screen } from "@testing-library/react";
import { HighlightedSentence } from "@/components/HighlightedSentence";

it("renders the exact original text and leaves gaps neutral", () => {
  const original = "The book is interesting.";
  const { container } = render(<HighlightedSentence result={{
    original,
    segments: [
      { start: 0, end: 8, type: "noun" },
      { start: 9, end: 11, type: "verb" },
      { start: 12, end: 23, type: "adjective" }
    ],
    translation: "这本书很有意思。"
  }} />);
  expect(container.textContent).toBe(original);
  expect(screen.getByText(".")).toHaveClass("segment--neutral");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/components/HighlightedSentence.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现无损切片渲染**

```tsx
// src/components/HighlightedSentence.tsx
import type { ReactNode } from "react";
import type { AnalysisResult } from "@/domain/analysis";

export function HighlightedSentence({ result }: { result: AnalysisResult }) {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  result.segments.forEach((segment, index) => {
    if (segment.start > cursor) {
      pieces.push(<span className="segment--neutral" key={`gap-${index}`}>{result.original.slice(cursor, segment.start)}</span>);
    }
    pieces.push(
      <span className={`segment segment--${segment.type}`} key={`segment-${index}`}>
        {result.original.slice(segment.start, segment.end)}
      </span>
    );
    cursor = segment.end;
  });
  if (cursor < result.original.length) {
    pieces.push(<span className="segment--neutral" key="tail">{result.original.slice(cursor)}</span>);
  }
  return <div className="highlighted-sentence">{pieces}</div>;
}
```

```tsx
// src/components/GrammarLegend.tsx
const labels = [
  ["noun", "名词性"],
  ["adjective", "形容词性"],
  ["adverb", "副词性"],
  ["verb", "动词"]
] as const;

export function GrammarLegend() {
  return (
    <ul className="legend" aria-label="颜色说明">
      {labels.map(([type, label]) => (
        <li key={type}><span className={`legend__swatch segment--${type}`} />{label}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: 验证并提交**

Run: `pnpm test:run tests/components/HighlightedSentence.test.tsx`

Expected: 原文保真和中性标点测试通过。

```bash
git add src/components/GrammarLegend.tsx src/components/HighlightedSentence.tsx tests/components/HighlightedSentence.test.tsx
git commit -m "feat: render four-color grammar segments"
```

### Task 7: 完成单页交互和响应式视觉

**Files:**
- Create: `src/components/SentenceAnalyzer.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/components/SentenceAnalyzer.test.tsx`

- [ ] **Step 1: 写用户流程测试**

测试必须覆盖：空输入显示本地错误；提交期间按钮禁用且文字为“分析中…”；成功后展示四色原句和翻译；API 失败后保留输入并展示服务端消息；第二次成功结果替换第一次结果。

关键成功用例：

```tsx
it("submits one sentence and shows the result", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    original: "She left.",
    segments: [{ start: 0, end: 3, type: "noun" }, { start: 4, end: 8, type: "verb" }],
    translation: "她离开了。"
  }), { status: 200 })));

  render(<SentenceAnalyzer />);
  await userEvent.type(screen.getByLabelText("英文句子"), "She left.");
  await userEvent.click(screen.getByRole("button", { name: "分析句子" }));
  expect(await screen.findByText("她离开了。")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test:run tests/components/SentenceAnalyzer.test.tsx`

Expected: FAIL，交互组件不存在。

- [ ] **Step 3: 实现交互组件**

```tsx
// src/components/SentenceAnalyzer.tsx
"use client";

import { useState, type FormEvent } from "react";
import { validateSentenceInput } from "@/domain/input";
import type { AnalysisResult } from "@/domain/analysis";
import { GrammarLegend } from "@/components/GrammarLegend";
import { HighlightedSentence } from "@/components/HighlightedSentence";

export function SentenceAnalyzer() {
  const [sentence, setSentence] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateSentenceInput(sentence);
    if (!validation.ok) return setError(validation.message);
    setError("");
    setStatus("loading");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence: validation.value })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "分析失败，请重试。");
      setResult(body as AnalysisResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分析失败，请重试。");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="analyzer">
      <form className="input-card" onSubmit={submit}>
        <label htmlFor="sentence">英文句子</label>
        <textarea
          id="sentence"
          maxLength={500}
          value={sentence}
          onChange={(event) => setSentence(event.target.value)}
          placeholder="例如：The book that I bought yesterday is interesting."
        />
        <div className="input-card__footer">
          <span>{sentence.length}/500</span>
          <button disabled={status === "loading"} type="submit">
            {status === "loading" ? "分析中…" : "分析句子"}
          </button>
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <article className="result-card">
          <GrammarLegend />
          <HighlightedSentence result={result} />
          <div className="translation"><h2>自然中文翻译</h2><p>{result.translation}</p></div>
        </article>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 实现已确认的单页视觉**

在 `globals.css` 定义：粉色 `#fce7f3/#831843`、黄色 `#fef3c7/#78350f`、绿色 `#dcfce7/#14532d`、紫色 `#f3e8ff/#581c87`。使用柔和浅色页面背景、白色卡片、清晰焦点环；小于 `640px` 时减少间距并让按钮占满宽度。结果顺序固定为图例、四色原句、自然中文翻译。

- [ ] **Step 5: 验证并提交**

Run: `pnpm test:run tests/components/SentenceAnalyzer.test.tsx tests/components/HighlightedSentence.test.tsx && pnpm typecheck && pnpm lint`

Expected: 组件测试、类型检查和 lint 全部通过。

```bash
git add src/app src/components/SentenceAnalyzer.tsx tests/components/SentenceAnalyzer.test.tsx
git commit -m "feat: build responsive sentence analyzer page"
```

### Task 8: 端到端验收与项目文档

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/analyze.spec.ts`
- Create: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 编写不依赖真实 AI 的端到端测试**

Playwright 测试拦截 `**/api/analyze` 并返回固定结果，随后验证：输入和提交可用、加载后显示四类图例、原句文本完全一致、翻译可见、窄屏 `390×844` 不产生水平滚动。

```ts
// e2e/analyze.spec.ts
import { expect, test } from "@playwright/test";

test("analyzes a sentence on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/analyze", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      original: "She left because she was tired.",
      segments: [
        { start: 0, end: 3, type: "noun" },
        { start: 4, end: 8, type: "verb" },
      { start: 9, end: 31, type: "adverb" }
      ],
      translation: "她因为累了而离开。"
    })
  }));
  await page.goto("/");
  await page.getByLabel("英文句子").fill("She left because she was tired.");
  await page.getByRole("button", { name: "分析句子" }).click();
  await expect(page.getByText("她因为累了而离开。")).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
```

- [ ] **Step 2: 完成 README**

README 写明产品用途、Node/pnpm 前置条件、安装命令、`.env.local` 配置、`pnpm dev`、全部测试命令、四色含义及“默认不保存句子”的隐私说明。

- [ ] **Step 3: 运行完整验证**

Run:

```bash
pnpm test:run
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: 所有单元/组件/API/E2E 测试通过，类型检查和 lint 无错误，生产构建成功。

- [ ] **Step 4: 使用代表性句型人工验收**

使用设计文档中的 8 类句型逐一检查：简单主谓宾、介词短语作定语、定语从句、名词性从句、副词性从句、不定式作名词性成分、不定式作副词性成分、系表和并列结构。确认标注颗粒度、四种颜色和自然翻译符合设计文档。

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts e2e README.md .gitignore
git commit -m "test: verify MVP user journey"
```

## 最终完成标准

- `pnpm test:run`、`pnpm typecheck`、`pnpm lint`、`pnpm build` 和 `pnpm test:e2e` 全部通过。
- 浏览器端永远从用户原句按偏移量渲染，不展示模型改写的英文。
- 四色映射与文字图例严格一致：粉色名词性、黄色形容词性、绿色副词性、紫色动词。
- 所有错误状态保留用户输入，错误信息清楚且不泄露内部实现。
- 无账号、历史记录、聊天、详细语法讲解或段落分析等超出 MVP 的功能。
