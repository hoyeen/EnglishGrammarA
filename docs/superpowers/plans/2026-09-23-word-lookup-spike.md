# 点词查询技术验证计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用 20 个固定上下文检验词典候选与现有 DeepSeek 的组合，形成可复核的结果和正式接入依据。

**Architecture:** 独立实验脚本读取人工构造的样例，逐词获取 FreeDictionaryAPI.com 数据，再分别请求模型选择本句释义和候选 ID。实验不接入应用路由和 UI，不修改现有语法分析行为。脚本默认仅运行离线测试，显式 `--live` 才访问外部服务。

**Tech Stack:** 现有 Node.js、OpenAI SDK、Zod，Node 内置测试工具；无新依赖。

## 1. 样例与离线约束

- [x] 新建 `scripts/word-lookup/cases.json`：20 个原句、词和第几次出现，人工预期词义、原形与读音说明不传给模型。
- [x] 新建 `scripts/word-lookup/spike.test.mjs`：验证同句重复词坐标、候选与词条关联、仅允许已有 IPA、未知词和非法输出、词典故障降级。
- [x] 先运行 `node --test scripts/word-lookup/spike.test.mjs`，确认缺少实验模块导致失败。

## 2. 实验脚本

- [x] 新建 `scripts/word-lookup/spike.mjs`，导出 `locateCase`、`compactDictionary`、`validateSelection`、`lookupCase`。
- [x] 保留候选的词条 ID、词性、词义标签与发音标签；模型只能选择候选 ID，不能写音标。候选 ID 只能防止编造，读音语义适配仍需人工评估。
- [x] 使用现有 `DEEPSEEK_*` 环境变量及 Responses API 结构化输出；不输出密钥。词典阶段最多 5 秒、整体最多 15 秒，无自动重试；词典失败继续尝试仅释义。
- [x] 每个上下文单独请求模型，词典按精确查询词复用；并发最多 2。记录缓存是否命中、各阶段耗时、总耗时、候选和模型结果供复核。
- [x] 运行离线测试并检查脚本 lint。正式数据保存在忽略目录 `.next/word-lookup-spike/`，不将完整第三方词条提交到仓库。
- [x] 为观察到的错误保留安全阶段诊断；支持按 `--case` 选择样例、`--replay` 重放相同词典候选，区分供应商波动与提示词变化。

## 3. 实测与结论

- [x] 执行 `node --env-file=.env.local scripts/word-lookup/spike.mjs --live`，只发送固定样例和词典候选。
- [x] 人工逐项核对释义、原形和最终 IPA；分别统计正确、错误、缺失、失败，不以接口 200 或关键词命中代替准确性评价。
- [x] 新建 `docs/experiments/2026-09-23-word-lookup-spike.md`，记录模型、时间、20 行结果、延迟与限制；同步修订增量设计。
- [x] 验证文档链接、样例坐标和 Git 差异，提交本次实验相关文件。

## 参考

- [增量设计](../specs/2026-09-22-word-lookup-design.md)
- [词典 OpenAPI](https://freedictionaryapi.com/api/v1/openapi.json)
- [DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/)

本阶段交付可复现的技术验证。正式接口、缓存与交互另按验证结果实施。
