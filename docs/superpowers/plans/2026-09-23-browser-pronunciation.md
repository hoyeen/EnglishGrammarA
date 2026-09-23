# 浏览器单词朗读 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; execute inline in the existing workspace and preserve unrelated staged files.

**Goal:** 实现用户已确认的浏览器朗读方案：浮窗内手动点击发音，不自动播放。

**Architecture:** 独立 `WordPronunciation` 客户端组件使用 SpeechSynthesis；按单词位置设置 React key，切词、关闭、重新分析时卸载并取消发音。不增加后端接口、付费服务或依赖。

**Tech Stack:** React、Web Speech API、现有 Vitest / Playwright。

## 已确认设计

- 标题下面显示“发音”按钮，播放时可点击“停止”；开始新播放前清空队列，避免连续点击排队。
- 每次点击读取系统声音列表，优先英语英国音色，再选其他英语音色；列表暂不可用时设置 en-GB，让浏览器选择。该发音不保证匹配上下文 IPA，显示简短说明。
- 不支持时显示提示；播放异常或 15 秒无结束事件时停止并允许再次点击。旧播放回调不能改变新播放状态。
- 不调用项目查词/模型接口。浏览器或系统声音服务可能联网，不承诺离线或所有设备音质相同。

## 实施步骤

- [x] 新增 `tests/components/WordPronunciation.test.tsx`，用浏览器 API 替身验证手动播放、英语选择、停止/结束/失败、卸载取消、旧回调、不支持和空声音列表；先运行并确认失败。
- [x] 新增 `src/components/WordPronunciation.tsx`；在 `WordPopover.tsx` 使用 `key={JSON.stringify(state.token)}` 渲染；在 `globals.css` 添加按钮样式。
- [x] 在 `e2e/word.spec.ts` 验证浮窗发音按钮、无自动播放、切词/关闭停止，覆盖桌面及手机；更新 README 和增量技术说明。
- [x] 运行 Vitest 全集、Next build、TypeScript、ESLint 和 Edge 浏览器回归，审阅差异后仅提交本次文件。

参考：[SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)、[SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance)。
