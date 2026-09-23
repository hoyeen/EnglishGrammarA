# 点词查询技术验证记录

日期：2026-09-23，香港时间约 08:14–08:20。模型：项目现有配置 `deepseek-flash`，Responses API，reasoning=none。当前交付为独立实验，正式 `/api/word` 和浮窗尚未实现。

## 结论

“原句＋选中位置＋词典候选 → 本句中文释义＋有来源的音标”具备继续实现的基础。最终一轮 20 个固定样例中，19 个已知词的中文义经逐项复核符合原句，1 个编造词正确拒答。15 项同时返回适合本句的音标，4 个已知词缺失音标：1 个缺少对应词义的发音记录，3 个词典请求未成功。没有把缺失计为音标准确命中。

这证明小样可行，不能据此推导整体准确率或服务可用性。首版必须允许“有释义、暂无可靠音标”，并支持用户重试。原形为可选补充，本轮不能保证每个变形词都能返回原形。

## 方法与来源

- 固定输入：[20 个样例](../../scripts/word-lookup/cases.json)。人工预期不发给模型。
- 实验脚本：[spike.mjs](../../scripts/word-lookup/spike.mjs)，离线约束：[spike.test.mjs](../../scripts/word-lookup/spike.test.mjs)。两路并发，词典最多 5 秒，整体最多 15 秒，无自动重试。
- 词典：[FreeDictionaryAPI.com](https://freedictionaryapi.com/)，[官方字段说明](https://freedictionaryapi.com/api/v1/openapi.json)。保留词条、词性、释义、发音标签的关联，模型返回候选 ID，脚本从原候选提取 IPA。
- 模型调用按 [DeepSeek 官方 Responses 文档](https://api-docs.deepseek.com/guides/responses_api/)及项目现有方式构造。
- 发音人工交叉核对参考 Cambridge 的 [read](https://dictionary.cambridge.org/pronunciation/english/read)、[lead](https://dictionary.cambridge.org/us/pronunciation/english/lead)、[wind](https://dictionary.cambridge.org/us/pronunciation/english/wind)、[US/us](https://dictionary.cambridge.org/pronunciation/english/us) 等词条；允许常用英美读音及 IPA 记法差异。

IPA 来自 FreeDictionaryAPI.com 提供的 Wiktionary 词条，原词条链接见下表，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 标注。这里仅列本次选中的读音，不提交完整第三方词典快照。

## 调整过程，包含失败

| 轮次 | 观察 | 后续处理 |
| --- | --- | --- |
| 第一轮，20 例 | left-verb 无结果；read-past 返回同形原形；don't 返回不合约定的 do；us 增加原句不支持的“不包括听者” | 保留失败；增加阶段诊断；抑制同形原形；明确缩约／缩写／代词不另列原形；限制无依据的附加解释 |
| 第二轮，20 例 | 所有模型调用有结构化结果；us 仍增加“不包括听者”；left 动词条缺 IPA；部分可选原形缺失 | 检查词典发现 us 同时含包括／不包括听者两个细分义；要求返回最短本句中文对应词，无法区分的细分义取共有中文含义 |
| 第三轮，20 例 | 中文义通过 19 项、未知词正确拒答 1 项；15 个合适 IPA、4 个已知词缺失；3 次词典未成功后仅释义降级 | 记录实际缺失与延迟，不把第三轮写成 20 个完整成功 |
| 固定候选重放，1 例 | 用第二轮相同 us 词典候选重放新提示词，返回“我们”、/ʌs/，777ms | 排除第三轮 us 词典不可用造成的干扰；仍只是一次针对性回归 |

首轮 left-verb 11,527ms 后只有通用 Error 记录，不能确定原因，也不能称为已证实超时。后续诊断保留错误阶段、词典状态和候选，空模型输出有独立代码。首轮问题并未从统计中删除。

三轮共 60 次模型请求、42 次词典请求；重放另用 1 次模型请求、0 次词典请求。每轮 20 个位置对应 14 个精确词典查询键；6 次复用包含合并进行中的请求，不都是热缓存命中。没有预取所有句子单词，也没有实现应用缓存。

原形约定在实验中明确：它是辅助信息，缺失单独记录；同形不显示；缩约、缩写、代词不另列原形。原先 us 样例列出的 we 不是用户要求，不将该字段为空算作中文释义错误。第一、二轮 us 的无依据附加解释始终判错。

## 第三轮逐项复核

原句及位置见固定样例文件。下表释义和 IPA 为该轮实际输出，原形为空处记为“—”。

| 样例 ID／选词 | 本句释义 | 原形 | 实际 IPA | 耗时 ms／判断 |
| --- | --- | --- | --- | --- |
| left-verb／[left](https://en.wiktionary.org/wiki/left) | 离开 | leave | — | 1748；动词词条无 IPA，正确降级 |
| left-direction／left | 向左 | — | /ˈlɛft/ | 2271；义、音通过 |
| saw-verb／[saw](https://en.wiktionary.org/wiki/saw) | 看见 | — | /sɔː/ | 1087；义、音通过，可选原形 see 未返回 |
| saw-noun／saw | 锯子 | — | /sɔː/ | 1076；义、音通过 |
| read-present／[read](https://en.wiktionary.org/wiki/read) | 阅读 | — | /ɹiːd/ | 956；义、音通过 |
| read-past／read | 读 | — | /ɹɛd/ | 1054；义、音通过；单词译义不强制带“了” |
| went／[went](https://en.wiktionary.org/wiki/went) | 去了 | go | /wɛnt/ | 1622；义、音通过 |
| bought／[bought](https://en.wiktionary.org/wiki/bought) | 买了 | buy | /ˈbɔːt/ | 1870；义、音通过 |
| lead-verb／[lead](https://en.wiktionary.org/wiki/lead) | 带领 | — | /liːd/ | 2058；义、音通过 |
| lead-metal／lead | 铅 | — | /lɛd/ | 2127；义、音通过 |
| wind-noun／[wind](https://en.wiktionary.org/wiki/wind) | 风 | — | /ˈwɪnd/ | 1724；义、音通过 |
| wind-verb／wind | 缠绕 | — | /waɪnd/ | 1194；义、音通过 |
| contraction／[don't](https://en.wiktionary.org/wiki/don%27t) | 不 | — | /dəʊnt/ | 877；义、音通过 |
| possessive／John’s | 约翰的 | — | — | 5828；词典未成功，仅释义；可选原形 John 未返回 |
| hyphenated／well-known | 著名的 | — | — | 5600；词典未成功，仅释义 |
| uppercase／[US](https://en.wiktionary.org/wiki/US) | 美国 | — | /juː.ɛs/ | 1265；义、音通过 |
| lowercase／us | 我们 | — | — | 6125；词典未成功，仅释义；固定候选重放另验证 /ʌs/ |
| bank-finance／[bank](https://en.wiktionary.org/wiki/bank) | 银行 | — | /ˈbæŋk/ | 1097；义、音通过 |
| bank-river／bank | 河岸 | — | /ˈbæŋk/ | 797；义、音通过 |
| unknown／qzxnotaword | 无法确定（输出为空） | — | — | 1036；正确拒答 |

第三轮有 2 个明确超时类词典错误、1 个网络 TypeError；后者不能进一步断言具体网络原因。无效候选 ID 数为 0。总体时延中位数 1.44 秒，样本 P95 5.83 秒，最大 6.13 秒；这些是本机请求到模型输出的时间，不含 UI，也不是正式部署的 SLA。

## 复现与验证

本次离线约束测试 10/10 通过，脚本 ESLint 通过；原应用 Vitest 回归 12 个文件、79/79 测试通过。文档本地链接与接口示例坐标已检查。没有修改 `src`、依赖或配置，因此未重复应用构建与浏览器回归。

离线测试不会访问网络：

```powershell
node --test scripts/word-lookup/spike.test.mjs
node node_modules/eslint/bin/eslint.js scripts/word-lookup/*.mjs
```

在线实验使用现有 `.env.local`，会产生模型调用用量：

```powershell
node --env-file=.env.local scripts/word-lookup/spike.mjs --live
```

每次在线运行写入 `.next/word-lookup-spike/run-<UTC时间>.json`，同时更新 `results.json`。结果含选中位置、候选、输出、阶段耗时及脚本 SHA-256，不包含 API key。`.next` 是临时目录，重新构建可能清除，需另行保留本地记录时自行复制。

本次第三轮记录：`run-2026-09-23T00-18-33.695Z.json`，脚本 SHA-256 `ad932448aa45ecb9c1c300646d037689023c37caa2dc99ef80d3be611236733c`。其后增加了固定候选重放和运行失败退出码，模型提示词未再变更。us 重放记录：`run-2026-09-23T00-20-24.985Z.json`。旧结果文件本身不作为应用缓存。

```powershell
node --env-file=.env.local scripts/word-lookup/spike.mjs --live --case lowercase --replay .next/word-lookup-spike/run-2026-09-23T00-17-16.623Z.json
```

## 接入前后的边界

下一阶段按[增量设计](../superpowers/specs/2026-09-22-word-lookup-design.md)实现独立查词接口，再接单词定位、浮窗与页面缓存。原项目产品设计无需重写。

正式接入还需验证：完整词边界、所有格与缩约的不同含义、弱上下文的读音歧义、快速切词／关闭／重新分析的旧响应、页面缓存、供应商 429 和共享额度、键盘与手机布局。本实验未实现或声称验证这些行为。

候选存在只证明音标有来源，不能从程序层面证明选义正确。当前词典还会遗漏常用词的特定词义发音，候选裁剪也可能影响覆盖率。上线评测需扩大独立样例并保留“音标缺失”指标；不要用本固定集作为整体准确率宣传。
