# Speech (TTS/STT) — 语音功能

Last updated: 2026-11-20. Branch: `feat/i18n-zh-cn`.

## 概览

LearnHarness 的语音功能包含两个方向：

- **STT（语音转文本，听写）**：已完整实现。Deepgram 流式听写，麦克风采集 → 浏览器直连 Deepgram WSS → 转写结果 flush 到主输入。渲染进程不持有密钥，token 由服务端 `/api/stt/token` 短期铸造（TTL 300s）。
- **TTS（文本转语音，朗读）**：本轮新增。Deepgram Flux TTS 为内置供应商（同一 `DEEPGRAM_API_KEY`，中文 Early Access 音色），并支持“自定义端点”供应商（复用自定义模型端点的 baseUrl 与 `CUSTOM_OPENAI_API_KEY`，不新增独立密钥）。

默认 UI 语言是中文，因此 **TTS 必须支持中文朗读**，否则朗读中文回答会读不出或读错。Deepgram Flux TTS 对中文属 Early Access，**不做文本归一化**：数字、日期、缩写会按原文读出，需在合成前把数字/日期展开成中文文字（见 `src/core/speech-numbers.ts`）。

## 文件清单

### 客户端（纯逻辑，走 `@/src/core` barrel）

| 文件 | 职责 |
|------|------|
| `src/core/speech.ts` | 供应商词汇：`SpeechProviderId` ("deepgram"\|"custom"\|"edge")、`SpeechLanguageStrategy` ("auto"\|"zh"\|"en")、`SpeechAudioFormat`、`DEEPGRAM_FLUX_VOICES` / `EDGE_VOICES`、`speechVoiceCatalog`、`defaultSpeechVoice`、`resolveSpeechConfig` |
| `src/core/speech-text.ts` | Markdown → 可朗读片段（`speechChunks`），复用 `readContentSpans`（代码块按 `readCode` 处理，公式按 `math`: skip/label/read 处理） |
| `src/core/speech-numbers.ts` | 中文数字/日期展开（“尽力而为+兜底”，给 Flux TTS 中文 Early Access 无归一化的问题兜底） |
| `src/core/speech-math.ts` | LaTeX → 口语转换器（`speakMath(tex, "zh"\|"en")`），把公式读成「2 分之 1」「x 的平方」「从 i 等于 1 到 n 的 求和」 |
| `src/core/settings.ts` | `SpeechSettingsRecord`、`DictationSettings`（新增 `detectLanguage`/`autoSend`/`continuousReadback`）、`sanitizeSpeech`、`FACTORY_SETTINGS.speech` |
| `src/core/dictation.ts` | STT 现有实现；`deepgramListenUrl` 新增 `detectLanguage` 参数 |
| `components/speech-player.tsx` | 窗口级 TTS 播放器单例，generation 计数器防竞态，按 CHUNK_MAX=200 分块 POST `/api/tts/speak` |
| `components/speak-button.tsx` | 消息气泡内“朗读”按钮（复用 `MessageAction`，hover 显现，`data-testid="speak-button"`） |
| `components/speech-actions.tsx` | 选中文本工具条“朗读选段”动作（`createSpeakSelectionAction`） |
| `components/speech-auto-read.tsx` | 连续朗读模式：新助手回答自动入队 |
| `components/speech-shortcuts.tsx` | 快捷键 `toggle-speech`（mod+shift+v） |
| `components/speech-preference.ts` | `createSpeechStore` / `useSpeechSettings`（照 dictation-preference.ts 范式，PUT `/api/settings/speech`） |
| `components/settings/speech-section.tsx` | 设置页 Speech 段（8 行：provider/voice/customModel+customVoice/speed/language/autoRead/readCode/preview） |
| `components/ai-elements/message.tsx` | `MessageActions`/`MessageAction`——零使用的现成气泡按钮插槽 |
| `components/selection-toolbar.tsx` | `SelectionAction`——选中文本工具条插槽 |
| `components/keyboard-shortcuts.tsx` | 快捷键分发（新增 TTS 走 default 分支） |
| `src/core/keyboard.ts` | `KEYBOARD_ACTIONS` 新增 `toggle-speech` (mod+shift+v, global) |

### 服务端（Node，持有密钥）

| 文件 | 职责 |
|------|------|
| `src/server/speech.ts` | `synthesizeSpeech`：provider 分发（deepgram / custom / edge），服务端调用 TTS API，返回音频字节 |
| `src/server/edge-tts.ts` | Edge Read Aloud 传输层：Sec-MS-GEC v2 token、时钟偏差校正重试、WebSocket 会话、二进制帧拆包、SSML 组装。**协议相关代码全部集中在此** |
| `app/api/tts/speak/route.ts` | `POST /api/tts/speak`：`keyValue("DEEPGRAM_API_KEY")` → Deepgram `/v2/speak`；或 custom 端点；返回音频流（`Cache-Control: no-store`） |
| `app/api/tts/voices/route.ts` | `GET /api/tts/voices`：列出可用音色（deepgram 内置列表 / custom 端点探测） |
| `app/api/stt/token/route.ts` | STT 现有：`GET /api/stt/token` 铸 Deepgram 短时 token（TTL 300s） |
| `src/server/settings-body.ts` | `parseSpeechSettingsBody`、`SETTINGS_SECTIONS.speech` |
| `src/server/keys.ts` | `keyValue("DEEPGRAM_API_KEY")`：env-first，fresh-user switch 下只读 authStore |

### i18n

| 命名空间 | 内容 |
|----------|------|
| `speech` | TTS UI 文案（readAloud/stopReading/reading/readingElsewhere/synthesisFailed/continuousMode/.../nothingToRead），en + zh-CN |
| `settingsSpeech` | 设置段文案（title/hint/provider/voice/speed/language/autoRead/readCode/customModel/customVoice/format/preview/...），en + zh-CN |
| `settings` | 新增 `sections.speech`="Speech"/"语音"、`speechHint` |

## 默认供应商（owner 决定 2026-11-21）

**出厂默认是 `edge`**（`src/core/speech.ts` 的 `DEFAULT_SPEECH_PROVIDER`，`FACTORY_SETTINGS.speech` 与 `resolveSpeechConfig` 都读它）。

理由（均为实测，不是偏好）：

1. **公式读取**：Edge 正确读单个拉丁字母（`x` 就是 x），Flux 中文音色把 `b等于一` 读成 `b=`。公式朗读是本应用的核心场景，这一条权重最高。
2. **数字归一化**：Edge 自带归一化（`2024年3月5日，价格1234.56元` 原样发出即读对）；Flux 中文 Early Access 不归一化，必须靠 `speech-numbers.ts` 展开。
3. **零配置**：Edge 不需要密钥；Deepgram 需要 `DEEPGRAM_API_KEY`，新用户装完不能直接用。

**代价与已知风险**（这些都保留在文档里，不是隐藏项）：Edge 是非官方接口，微软不提供支持、可能随时变更，且商用无书面授权。因此：

- 设置页的 Edge 选项**始终显示免责提示**（`settingsSpeech.providerEdgeHint`）；
- Deepgram 与自定义端点作为明确的备选保留，一键可切；
- 需要正式条款的用户应改用 Azure（音色 id 相同，见下）。

## 供应商选型与成本

### Deepgram Flux TTS（内置，备选）

- 端点：`POST https://api.deepgram.com/v2/speak?model=flux-{voice}-{language}`，Header `Authorization: Token KEY`，body `{"text":"…"}`，响应体即音频（默认 mp3）。
- 中文音色（Early Access，9 个）：Bo/Haoran/Jian/Jie/Lijuan/Shufen/Wenbo/Wenjing/Zhen（男女各半）。台湾中文 4 个，粤语 1 个（Manlok）。
- 定价：**$0.045 / 1,000 字符**（Growth $0.0405）。朗读 1 万字约 $0.45。注册送 $200 额度。
- **Early Access 警告**：中文无文本归一化，数字/日期按原文读出 → 必须在客户端预展开（`speech-numbers.ts`）。
- 与现有 STT 同厂同 key（`DEEPGRAM_API_KEY`），用户无需新增密钥。

### 自定义端点（provider "custom"）

- 复用自定义模型端点的 baseUrl 与 `CUSTOM_OPENAI_API_KEY`，不新增独立 TTS 密钥或 binding。
- 设置段另设 `customModel`（模型 id）与 `customVoice`（音色名）。
- 服务端按 OpenAI 兼容 TTS 契约调用；若端点不发布音色列表，提示 `noVoices`。

### Microsoft Edge Read Aloud（provider "edge"，非官方）

**这是本项目唯一使用非官方接口的供应商。** 接入前请读完整节。

- 端点：`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`，单条 WebSocket，SSML 请求，返回 `audio-24khz-48kbitrate-mono-mp3`。
- 音色：实测 318 个；本仓库只收录中文（zh-CN 6 / zh-TW 3 / zh-HK 3）与英文（en-US / en-GB 共 15 个）。音色 id 与 Azure 语音**完全相同**，因此将来加 Azure 供应商可复用整张表。
- 成本：**免费**，无需密钥。
- 优势：微软自动做文本归一化（实测 `2024年3月5日，价格1234.56元` 原样发出即读对），音色质量高，SSML `prosody rate` 原生支持语速。
- 风险：见下方「许可与合规」。

#### 握手：Sec-MS-GEC v2

URL 必须携带时间派生的 token：

```
ticks  = (unixSeconds + 11644473600) 按 300 秒向下取整
input  = "<微软版权行><ticks × 10^7><TRUSTED_CLIENT_TOKEN>"
token  = "<CS64(input)>-<SHA256(input)>"
```

`Sec-MS-GEC-Version` 必须是 `2-<chromium 版本>`。**v1 形式（仅 SHA-256，版本前缀 `1-`）现已被 403 拒绝** —— 2026-11-21 实测：只带 `TrustedClientToken` → 403，v1 → 403，v2 → 200。这也是全网旧版 edge-tts 客户端集体失效的原因。

因为 token 由本机时钟派生，**时钟偏差超过一个窗口就会被拒**。因此 403 时读取响应 `Date` 头算出偏差，**只重试一次**；服务端没给可用时间就不重试（重试也只是同样的请求）。

#### 与 Deepgram 路径的两处差异

| | Deepgram Flux | Edge |
|---|---|---|
| 数字/日期归一化 | ❌ 需我们展开（`speech-numbers.ts`） | ✅ 自己处理，**必须跳过展开** |
| 单个拉丁字母 | ❌ 读错（实测 `b等于一` → `b=`） | ✅ 读对，**关闭音译** |

因此 `src/server/speech.ts` 对 edge 路径**不调用** `expandNumbersForSpeech`；`components/speech-player.tsx` 传 `letterNames: liveConfig.value.provider !== "edge"`。

#### 许可与合规（重要）

三层要分开看：

1. **代码许可** —— 本实现不引入任何新依赖（用仓库已有的 `undici` WebSocket）。协议行为参考了 `msedge-tts`（MIT，© 2023 Migushthe2nd）与 `rany2/edge-tts`（LGPLv3）；**未复制其源码**。本仓库为 AGPL-3.0-only，与两者均兼容。详见 `docs/THIRD-PARTY.md`。
2. **微软服务条款** —— 微软对其“教育/小规模用途”有口头认可，对“商用”**没有书面授权**。这是使用该供应商**唯一真实的许可风险**，与代码怎么写无关。
3. **反规避** —— 该 token 本质是访问控制令牌（上游项目文件名即 `drm.py`）。互操作性例外（DMCA §1201(f)）通常覆盖此类情形，风险低但非零。

**结论**：Edge 适合个人 / 小规模教学；对外分发或商用前应评估，或改用 Azure 语音服务（音色相同、有正式条款、F0 免费层 0.5M 字符/月）。

#### 已知限制

- 微软随时可能改协议；所有协议相关代码集中在 `src/server/edge-tts.ts` 一个文件，坏了只改这里。
- 无官方配额与 SLA。
- 无密钥 → 无速率限制保护，密集朗读可能被限流。

### 退路（未采用，作参考）

- 阿里云百炼托管 MiniMax：CNY 3.5/万字（≈$0.49/1k），hex 音频需解码，RPM 20/TPM 20000 限流紧。
- MiniMax 官方：$100/M 字符。
- 浏览器 `speechSynthesis`：不作为主路径（Windows 上 voices 依赖系统语言包，质量不可控），仅作免费降级选项（尚未实现）。

## UI 位置

1. **消息气泡内“朗读”按钮**：助手消息气泡右侧（`MessageActions` 插槽），hover 显现，点击朗读该消息全文，再点击停止。
2. **选中文本工具条“朗读选段”**：选中任意文本后出现的工具条，朗读仅被选中的片段。
3. **连续朗读模式（autoRead）**：设置页开启后，每条新助手回答自动入队朗读，无需手动点按钮。
4. **答题卡练习区朗读**：题干/选项旁插入 `SpeakButton`，朗读题目与选项文本。
5. **快捷键**：`mod+shift+v`（global）——正在读则停止，否则读最新助手回答。

所有 UI 通过 `speech-player.tsx` 窗口级单例串行，两个表面不会同时读。

## 设置项

路径：设置 → 语音（Speech）。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| provider | "deepgram" \| "custom" \| "edge" | **"edge"** | 语音供应商（切换时音色自动落到该供应商的默认值）。默认值见 `DEFAULT_SPEECH_PROVIDER` |
| voice | string | `DEFAULT_SPEECH_VOICE`（Deepgram Flux 中文女声） | 音色 id |
| speed | number | 1.0 | 语速（0.5–1.5，步进 0.05） |
| language | "auto" \| "zh" \| "en" | "auto" | 朗读语言策略 |
| autoRead | boolean | false | 连续朗读：新助手回答自动读 |
| readCode | boolean | false | 代码块也朗读（默认关） |
| readMath | boolean | true | 朗读公式（把 TeX 转成口语，默认开） |
| customModel | string | "" | 自定义端点模型 id |
| customVoice | string | "" | 自定义端点音色名 |
| format | "mp3" | "mp3" | 音频容器 |

## STT 补强（P6）

`DictationSettings` 新增三个布尔字段（默认 false）：

| 字段 | 说明 | UI 位置 |
|------|------|----------|
| detectLanguage | 听写时自动识别语言（Deepgram `detect_language=true`） | 设置 → 服务提供商 → 听写 → 自动识别语言 |
| autoSend | 听写结束后立即发送转写 | 同上 → 自动发送 |
| continuousReadback | 每段听写完成后自动朗读 | 同上 → 自动朗读回放 |

`deepgramListenUrl(language, detectLanguage)` 在 detectLanguage 时追加 `&detect_language=true`。

UI 实现在 `components/settings/keys-section.tsx`：三个 `SettingsRow`（testid `row-dictation-detect-language` / `row-dictation-auto-send` / `row-dictation-continuous-readback`）复用 `DictationToggle` 组件读写 `useDictationSettings()`。

## 公式朗读（LaTeX → 口语）

### 为什么需要它

Deepgram 的音频模型不认 LaTeX；它只能读「送过去的文字」。仓库里原本**没有**把公式转成口语的能力：`src/core/content-reader.ts` 只负责切出公式边界并交出 TeX 源码，`src/core/math-delims.ts` 只做分隔符兼容。因此 `speechSegments` 对 `span.kind === "math"` 只有在 `math === "label"` 时才输出一句「公式」，否则整段丢弃——**朗读时只听到散文，公式悄无声息地消失**。

### 实现

新增 `src/core/speech-math.ts`：

- `export type SpeechMathLocale = "zh" | "en";`
- `export function speakMath(tex: string, locale: SpeechMathLocale): string`
- 内部 `class MathReader` 逐 token 解析 TeX：`readBase()` / `readCommand()` / `readNamedCommand()` / `readDelimiter()` / `readRawGroup()` / `readGroupNodes()` / `readOptionalBracket()` / `readOptionalScript()` / `parseSequence()`。

设计规则（写在文件头注释里）：**BEST EFFORT, NEVER LOSSY, NEVER INVENTED**——未知命令读出它自己的名字（`\weirdthing` → 「weirdthing」），绝不静默丢弃。

读法约定：

| 写法 | 中文 | 英文 |
|------|------|------|
| `x^2` / `x^3` / `x^{10}` | x 的平方 / x 的立方 / x 的十次方 | x squared / x cubed / x to the 10th power |
| `\frac{2}{3}` | 三分之二（分母在前） | fraction 2 over 3 |
| `\sqrt{x}` | 根号 x | square root of x |
| `\sum_{i=1}^{n}` | 从 i 等于 1 到 n 的 求和 | sum from i equals 1 to n |
| `\binom{n}{k}` | 组合数 n 选 k | binomial coefficient n choose k |
| `\text{hello}` | hello（字母连成词，不逐字母读） | hello |
| `\mathbb{R}` | 实数集 | the real numbers |
| `\begin{pmatrix}` / `\begin{cases}` | 矩阵 / 分段函数 | matrix / piecewise function |
| `\vec{v}` | 向量 v | vector v |

### 中文读法约定（已与用户确认）

| 项 | 约定 | 例子 |
|----|------|------|
| 分式 | **分母 分之 分子**（课堂语序）；**分母里的负号提到分式最前面** | `\frac{2}{3}` → 「三分之二」；`\frac{x+1}{x-1}` → 「x 减一分之 x 加一」；`\frac{1}{-2}` → 「负二分之一」；`\frac{-1}{2}` → 「二分之负一」 |
| 嵌套分式 | **分子或分母本身是分式时，整个分式改读「分子 除以 分母」**（不加停顿） | `\frac{\frac{1}{2}}{3}` → 「二分之一除以三」；`\frac{1}{\frac{2}{3}}` → 「一除以三分之二」；`\frac{\frac{1}{2}}{\frac{3}{4}}` → 「二分之一除以四分之三」 |
| 根式 | 根号 X / n 次根号 X | `\sqrt{x}` → 「根号 x」；`\sqrt[3]{x}` → 「三次根号 x」 |
| 正负号 | **项的开头读「负」，前面有操作数读「减」；减号紧跟括号读「减去」** | `-\frac{2}{3}` → 「负三分之二」；`a - 2` → 「a 减二」；`(x-1) - 2` → 「…括号减二」（右括号结束一个项）；`3 - (-2)` → 「三减去括号负二括号」 |
| 数字 | 逐值读中文数字，小数按位读 | `2x` → 「二 x」；`3.14` → 「三点一四」 |
| 组合数 | 组合数 上 选 下 | `\binom{n}{k}` → 「组合数 n 选 k」 |
| 括号 / 花括号 | 课堂读法：括号 / 大括号 | `f(x)` → 「f 括号 x 括号」 |
| 绝对值 | X 的绝对值 | `\|x-1\|` → 「x 减 1 的绝对值」 |
| 字母 | 逐字母按英文字母名读 | `ax^2` → 「a x 的平方」 |
| 极限 | 极限 当 X 趋于 Y | `\lim_{x \to 0}` → 「极限 当 x 趋于 0」 |
| 集合构造 | `\mid` 读「使得」；单独用读「整除」 | `\{x \mid x>0\}` → 「大括号 x 使得 x 大于 0 大括号」 |

符号覆盖：ASCII 运算符（`+ - = < > ( ) [ ] { } , ; : . ' ! ? / * %`）与 **Unicode 数学符号**（`≤ ≥ ≠ ≡ ≈ ∝ ∈ ∉ ⊂ ⊆ ∪ ∩ ∅ × ÷ ± √ ∑ ∏ ∫ → ← ↔ ⇒ ⇔ ∀ ∃ ∄ ⊥ ∥ ∂ ∇ … ⌈ ⌉ ⌊ ⌋ ℝ ℓ ∓ ⊕ ⊗` 等）都有中文读法，不会原样丢给 TTS 被英文念出。中文重音符号（`\hat` `\tilde` `\bar` `\underline` `\dot`）也不再被丢弃，改读「带帽 / 带波浪 / 带横线 / 带下划线 / 带一点」。

补充覆盖：

| 类别 | 命令 | 读法 |
|------|------|------|
| 取整 | `\lfloor x \rfloor` / `\lceil x \rceil` | 「x 的下取整」/「x 的上取整」 |
| 范数 | `\left\| x \right\|` / `\lVert x \rVert` | 「x 的范数」 |
| 尖括号 | `\langle x \rangle` | 「左尖括号 x 右尖括号」 |
| 取模 | `a \bmod b` / `a \pmod{n}` | 「a 取模 b」/「a 模 n」 |
| 逻辑 | `\nexists x` | 「不存在 x」 |
| 大算符 | `\coprod` `\bigsqcup` `\bigsqcap` | 「不交并」/「并集」/「交集」 |
| 花体 | `\mathfrak{g}` `\mathscr{L}` `\boldsymbol{v}` | 读字母本身，不丢符号名 |
### 接线路径

1. `src/core/speech-text.ts`：`SpeechTextOptions` 新增 `math?: "skip" | "label" | "read"` 与 `mathLocale?: SpeechMathLocale`；`DEFAULT_OPTIONS = { readCode: false, math: "skip", mathLocale: "zh" }`。`math: "read"` 时把 `speakMath(body, mathLocale)` 的结果作为一个 `kind: "math"` 片段插入。
2. `src/core/speech.ts`：`SpeechSettings.readMath?` / `SpeechConfig.readMath`；`resolveSpeechConfig` 里 `readMath: settings?.readMath !== false`（**默认开**）。
3. `src/core/settings.ts`：`SpeechSettingsRecord.readMath?` + `sanitizeSpeech` 布尔校验 + `FACTORY_SETTINGS.speech.readMath = true`。
4. `src/server/settings-body.ts`：`parseSpeechSettingsBody` 校验 `readMath` 必须是 boolean，否则 400。
5. `components/speech-player.tsx`：分块时传 `math: liveConfig.value.readMath ? "read" : "skip"`，并按「朗读语言」决定 `mathLocale`——显式 language 为 zh/en 时跟随；`auto` 时由音色 id 推断（`speechVoiceLanguage(voice)`），中文音色读中文、英文音色读英文。
6. `components/settings/speech-section.tsx`：新增开关「朗读公式」（testid `row-speech-read-math`），i18n 键 `settingsSpeech.readMath` / `readMathHint`。

：**「对称轴 x = -b/2a」**。这类文字在渲染层是普通 prose，不会进 `speakMath`，于是符号原样到达语音，中文音色读不出 `=`。

`speakMathOperators(text, locale)`（`src/core/speech-math.ts`）补上这一层：它只替换**有名字**的符号，其余原样保留。

- 触发条件：`speech-text.ts` 的 `readProse` 在 `math === "read"` 时对每个 prose 片段调用一次。
- **同一符号的字形变体会一并识别**：`=` / `＝`(U+FF1D) / `⹀` / `꞊`；`-` / `−`(U+2212) / `－`(U+FF0D)；`+` / `＋`(U+FF0B)。模型在中文语境里常写全角符号，它们曾原样到达语音（这正是「= 号读不准」的真实原因）。
- 覆盖：`=` `＝` `<` `>` `<=` `>=` `≤` `≥` `≠` `≈` `≡` `∝` `±` `∓` `×` `÷` `/` `+` `＋` `-` `−` `－` `∈` `∉` `⊂` `⊆` `∪` `∩` `∅` `∀` `∃` `¬` `⊥` `∥` `→` `⇒` `⇔` `π` `∞` `√` `·` `…` `∵` `∴` `°` `∶`，以及上标 `²` `³` `^` 与下标 `_`。
- 正负号沿用同一规则：项的开头读「负」，前面有操作数读「减」。
- **URL 与文件路径先被保护**：`docs/speech.md` 与 `https://…/a=b` 原样保留，不会被读成除法或等式。
- 只作用于 `math === "read"`（即「朗读公式」开关打开）。`math === "skip"` 时正文原样输出，不做任何改写。

### 分块以句子为单位，不按片段切

早先 `speechChunks` 对每个 segment 单独分句，于是**一句混排的话被切成多个语音请求**：

```
"提取 $a = -\dfrac{2}{3}$："
  旧：["提取", "a 等于负三分之二", "："]     ← 三个请求，每段各自成句
  新：["提取 a 等于负三分之二："]              ← 一个请求
```

单独把「提取」或「：」送进 TTS，会得到没有语调的孤立读音（也正是"读成别的词"这类错觉的来源）。现在先在**整段文本**上分句，再把仍不构成完整句的片段（前一段不以 `。！？；….!?;:` 结尾）与邻句合并——合并后不超过 `max` 字符才合，否则保持分开。

### 拉丁字母转中文音译

实测（真实 Deepgram API，2026-11-21）确认：**Flux 中文音色单独读一个拉丁字母时不稳定**。同一句 `L等于一`：

| 字母 | STT 回听 | |
|------|---------|---|
| a / x / y / n / p | a等于一 / x等于1 / y等于1 / n等于一 / p等于一 | 正常 |
| **b / c / m / t / A / Y** | **b=** / **c等e页** / **n=** / **t等于ye** / **i=1** / **外等一。** | 读错 |

因此中文朗读会把**单独出现**的拉丁字母换成中文音译（`LETTER_ZH`，`src/core/speech-math.ts`）：a→诶、b→必、x→艾克斯、y→歪、n→恩、k→开、z→贼……

- 只转写**单个**字母：两个及以上字母是一个名字（`sin`、`AB`），Flux 读得对，保持原样。
- 只作用于中文朗读；英文朗读保留原字母。
- 这也是老师上课的口头读法（「y 等于」就是说「歪 等于」）。

**中文读法禁止在拉丁字母两侧加空格**：实测 `x 等于负三分之二` 被读成 `istron于-2`，而 `x等于负三分之二` 干净。所以 `joinParts()` 在中文下一律紧接（`parts.join("")`），英文才用空格。

### 已知限制

- 数字展开（`speech-numbers.ts`）在服务端合成前执行。公式内的数字已由 `localizeDigits()` 按公式读法语言预先展开，因此中文音色下不会出现二次展开；英文公式保留阿拉伯数字，交给同一层展开为英文数词。
- 中文 `\frac` 读作「分母分之分子」（分母在前），英文仍读「fraction 2 over 3」（分子在前）——两种语言的课堂语序不同，不要统一。
- **嵌套分式为何改读「除以」**：中文「分之」连用两次会产生歧义。实测 Edge 返回的音频里，`\frac{\frac{1}{2}}{3}` 与 `\frac{1}{\frac{2}{3}}` 当前都读成「三分之二分之一」，**字节完全相同（均 12240 B）**——听者无法判断内层分式在分子还是分母。改为「除以」后两者分开（12816 B / 12384 B）。英文从未有这个问题（`fraction fraction 1 over 2 over 3` 词序本身保留了结构）。
  - **残留限制**：分母本身仍是分式、且再向外嵌套时，连续的「除以」受左结合影响，`\frac{1}{\frac{\frac{2}{3}}{4}}` 与 `\frac{\frac{1}{\frac{2}{3}}}{4}` 仍可能同读作「一除以三分之二除以四」。这需要括号语（「一除以 括号 三分之二除以四 括号」）才能彻底消除，**当前未实现**。
- 极限目前读作「极限 当 x 趋于零」，其后被求极限的表达式排在后面（`\lim_{x \to 0} f` → 「极限 当 x 趋于零 f」）。课堂更常见的「f 当 x 趋于零 的极限」尚未实现。
- **二维结构无法用线性语音表达（owner 决定 2026-11-21：不处理）**。分数线、分式相除这类**二维版面**信息，压平成一维语音后必然丢失层级。实测两类：
  - 分式除以分式（`\frac{A}{B}\div\frac{C}{D}`）读作「…B之分之A 除以 D分之C」。「分之」与「除以」在中文里同义，三处除法连读时听者无法还原运算顺序。第 (4) 类题整句约 11.6 秒，越长的式子越难记。
  - 分子分母都含分式系数时（`\frac{\frac{1}{2}x^2-2x}{\frac{1}{3}x^2-4x+4}`），两处「分之」连用会读成「…除以…」，边界变模糊；甚至与另一个不同的式子（多项式里含分式项）读成同一句。
  - **owner 判断：实际情况复杂式子会看题，不靠听题。** 因此不加括号、不改读法 —— 加括号会伪造原文不存在的符号（`\frac{2}{3}` 会读成「括号二括号分之括号三括号」，多花 1.3 秒），代价大于收益。
  - **仍然正确的情形**：分子分母都是整式时读法准确。例如 `\frac{a^2-2a}{a^2-4a+4}` → 「a的平方减四a加四分之a的平方减二a」，这是最常见的一类题。
- **原式真的写了括号时**，会读成「括号…括号」，此时边界清楚（`\frac{(a+b)}{(c+d)}` → 「括号a加b括号分之括号c加d括号」）。这是用户可自行采用的规避方式，但**不会**由朗读器自动添加。

## 测试

- `npm test` = `NODE_ENV=test tsx --test tests/*.test.ts tests/*.test.tsx`
- 与本次变更相关的测试：
- `tests/dictation-preference.test.ts` —— 听写偏好 store（整段 PUT 合并、并发开关不互相取消、单选项竞争被拒、部分存储段落 factory 值兜底）
- `tests/speech-preference.test.ts` —— 朗读偏好 store（同构用例）
  - `tests/dictation-language.test.ts` / `tests/dictation-picker.test.tsx` / `tests/dictation-flow.test.tsx` / `tests/dictation-warm.test.ts` / `tests/plugin-dictation.test.tsx`
  - `tests/settings-body.test.ts`（SETTINGS_SECTIONS 断言已加 "speech"）
- `tests/speech-numbers.test.ts` / `tests/speech-text.test.ts`（21 例）
- `tests/settings-write-queue.test.ts` —— 写入队列本身（串行化、单选项竞争被拒、独立开关排队、失败回滚、conflicts/busy 语义）
- `tests/speech-math.test.ts`（22 例：幂/分数/根号/关系符/希腊字母与函数/求和上下限/未知命令不丢/\text 连词/reader 读公式/mathLocale 决定语言/取整与范数/尖括号/取模语序/不交并与花体）
  - `tests/chatgpt-connection-ui.test.tsx` / `tests/render-settings.test.tsx`（设置页导航新增 speech 段后的断言更新）
- 真机音质验证需用户自备 Deepgram key：开发机上没有应用用户数据目录中的 `auth.json`，也没有 `.env.local` 或仓库 `data/auth.json`，本机无任何真实 API key。

### 设置段「整段替换」写入契约（重要）

`PUT /api/settings/[section]` 是**整段替换**：请求体即该段的完整期望值，未出现的字段表示「取消该覆盖」。因此两个偏好 store（`components/dictation-preference.ts`、`components/speech-preference.ts`）在写任何单个开关前，都会把**当前已确认的整段快照**合并进请求体，避免关掉一个开关时把兄弟开关清空。读取时缺失字段一律回落到 `FACTORY_SETTINGS` 的对应值。

并发写入由共享队列 `src/core/settings-write-queue.ts`（`createWriteQueue`）处理，它同时满足两条互斥的要求：

- **单选项**（听写语言；朗读的供应商/音色/语速/语言/自定义模型等）在一个写还在飞行时，**新的选择直接被拒绝**（返回 `false`）——它绝不能继承前一次写的成功。
- **独立开关**（`detectLanguage` / `autoSend` / `continuousReadback` / `autoRead` / `readCode` / `readMath`）会被**排队执行**，点击永不丢失。

队列的其余规则：

- 每次写发送「最后确认值 + 自己的 patch」，所以后到的写不会抹掉前一个写的兄弟字段。
- 写成功只 publish **自己触碰的字段**，排队中的写保留自己的乐观值，直到它自己被确认。
- 写失败只回滚**自己触碰的字段**到最后的确认值，并发布错误信息。
- `writes.conflicts(patch)` 在乐观翻转**之前**检查冲突，被拒绝的选择不会改动任何状态。
- `writes.pending()` / `writes.busy()` 供 store 判断「是否有写在进行」——注意读取时必须用 `writing.current`（可能为 `null`），不能直接对包装对象做真值判断。
- **独立开关在写入进行中仍可点击**：`Toggle` 不再绑定 `disabled={saving}`。队列已经保证写入串行与字段级归属，把开关禁用只会让用户的点击被浏览器直接丢弃（表现为「点了一个开关，另一个开关的点击没生效」）。只有真正的单选项（供应商/音色/语言下拉）在写入中保持禁用。

## 验收清单（P10）

- [x] `tsc --noEmit`：EXIT 0
- [x] `eslint .`（speech 相关文件）：0 errors
- [x] `x18n check`：0 errors（已补 `settings.speechHint` 到 en/zh-CN）
- [x] `npm test` 全量：431 个测试文件分 4 批跑完（4 批并行会因内存压力误报，串行复跑全过）；与本次变更相关的失败 0 个。全量中剩余的失败为 pre-existing，且其依赖文件（`src/store/auth.ts`、`scripts/build-plugin-authoring.mjs`、`src/core/contracts/subscriptions.ts`）在本次工作区**未被修改**
- [x] 浏览器端到端（Chrome + puppeteer-core，dev server）：三个听写开关连续快速点击后全部为 true 且存储一致；语音段 autoRead / readCode / readMath 同时为 true 且存储一致；刷新后全部保持；语言下拉可选择并保存（zh-CN → ja）；页面 0 JS error，唯一 404 为 `/favicon.ico`（无害）
- [ ] 真机音质：待用户提供 Deepgram key 后验证

## 里程碑

- P0–P5 ✅：核心 TTS 实现、设置段、快捷键、i18n、设置页接线、气泡/选区/答题卡朗读
- P6 ✅：STT 补强（detectLanguage/autoSend/continuousReadback）
- P7 ✅：i18n（en + zh-CN）
- P8 ✅：测试文件补全（dictation-preference 追加 2 例 + speech-preference 新建 3 例）+ settings-body.test.ts 断言已更新
- P9 ✅：docs/speech.md（本文件）
- P10 ✅：tsc / eslint / x18n check 全绿；TTS/STT 专项 14 个测试文件 234 例全过；回归抽查 57 个相关文件 668 例全过（余 5 个 pre-existing 失败）；浏览器端到端验证开关互不取消
- P11 ✅：公式朗读（`src/core/speech-math.ts` TeX→口语、`readMath` 开关默认开、读法语言跟随朗读语言）

## 注意事项

- 工作区处于 `feat/i18n-zh-cn` 分支，约 168 项改动未提交。**用户明确要求：不自动 git add/commit。**
- 插件无法把按钮放进消息气泡（`PluginActionPlacement` 仅 sidebar/graph/top-bar），气泡朗读按钮由宿主直接渲染。
- 渲染进程无 Node，TTS 合成凭据仅由服务端持有，客户端只见音频字节。