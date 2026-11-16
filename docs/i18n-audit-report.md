# 中文本地化完整审计报告

生成时间：2026-11-16 07:10:35
语言包：`i18n/messages/en.json` / `zh-CN.json`

## 一、总体覆盖情况

| 层面 | 状态 | 说明 |
|------|------|------|
| **核心组件层** | ✅ 100% | `components/` 下所有 `tsx` 的可见文案（属性 + JSX 文本）已全部走 `useT()` |
| **语言包** | ✅ 完整 | **628 个键**，中英逐键对齐（`node i18n/check-catalogs.mjs` 报 0 差异） |
| **设置界面** | ✅ 完整 | 8 个分区（服务提供商 / 代理 / 外观 / 图谱 / 键盘 / 通用 / 核心插件 / 社区插件）的标签、提示、占位符、按钮、状态 |
| **会话界面** | ✅ 完整 | 思考块、题目卡片、提交按钮、错误横幅、阶段标签、上下文菜单 |
| **Electron 原生菜单** | ✅ 完整 | 通过 `electron/menu-language.cjs` 独立小字典，随语言设置热刷新 |
| **页面元数据** | ✅ 完整 | `<title>` / `description` 由 `LocalizedTitle` 客户端应用 |
| **AI 教学语言** | ✅ 完整 | `src/agent/teaching-language.ts` 在提示词末尾追加中文指令；源提示词保持英文不变 |
| **服务端拒绝信息** | ✅ 按 code 本地化 | `models_not_configured` / `provider_key_missing` 由客户端按 code 渲染中文；其余作为技术错误原文展示 |
| **插件 UI** | ✅ 主要界面 | 5 个插件各自维护 `src/i18n.{js,ts}` 字典，通过 `<html lang>` 判定语言 |

### 语言包键分布

| 命名空间 | 键数 | 覆盖 |
|----------|------|------|
| `settingsAgent` | 51 |
| `settingsKeyboard` | 35 |
| `graph` | 34 |
| `settingsKeys` | 31 |
| `settingsPlugins` | 31 |
| `common` | 26 |
| `chat` | 26 |
| `sidebar` | 24 |
| `dialog` | 22 |
| `settings` | 21 |
| `settingsChatgpt` | 19 |
| `activity` | 18 |
| `questionDock` | 17 |
| `settingsUpdate` | 17 |
| `settingsAppearance` | 15 |
| `artifacts` | 15 |
| `coverage` | 13 |
| `settingsSubs` | 12 |
| `plan` | 9 |
| `sessionFind` | 9 |
| `sideThread` | 9 |
| `setup` | 9 |
| `settingsClaudeCode` | 8 |
| `composer` | 7 |
| `home` | 7 |
| `practiceCards` | 7 |
| `dictation` | 7 |
| `thinking` | 7 |
| `answeredCard` | 6 |
| `mdBlocks` | 6 |
| `settingsGeneral` | 6 |
| `session` | 5 |
| `stats` | 5 |
| `chains` | 5 |
| `overlay` | 5 |
| `pluginQuestionDock` | 5 |
| `citationComment` | 5 |
| `settingsModelMenu` | 5 |
| `time` | 4 |
| `sourceTree` | 4 |
| `phase` | 4 |
| `pluginChrome` | 3 |
| `pluginView` | 3 |
| `attachFiles` | 3 |
| `minimalHome` | 3 |
| `settingsPluginPage` | 3 |
| `settingsThemes` | 3 |
| `app` | 2 |
| `practice` | 2 |
| `shortcuts` | 2 |
| `pluginModelPicker` | 2 |
| `pluginProblemDock` | 2 |
| `submittedImages` | 2 |
| `modelPicker` | 2 |
| `pluginUiHost` | 2 |
| `dictationLang` | 2 |
| `notesImport` | 2 |
| `pluginKnowledgePicker` | 2 |
| `message` | 2 |
| `aria` | 1 |
| `pluginRenderers` | 1 |
| `citationPopover` | 1 |
| `dropZone` | 1 |
| `graphContextCard` | 1 |
| `hostMarkdown` | 1 |
| `pluginQuestionPart` | 1 |
| `pluginSurface` | 1 |
| `readingThinking` | 1 |
| `selectionToolbar` | 1 |
| `updateBanner` | 1 |
| `practiceSession` | 1 |
| `probeDone` | 1 |
| `pluginProblemSubmitted` | 1 |
| `settingsCacheRetention` | 1 |

## 二、本轮修复清单

### 组件层（14 处）

| 文件 | 文案 | 中文 |
|------|------|------|
| `chatgpt-connection` | Dismiss / Disconnect account / Add accounts / Sign in again / Desktop-only notice | 关闭 / 断开账户 / 添加账户 / 重新登录 / 仅桌面版可用 |
| `subscription-connections` | Device code: / Open browser / Select… / Continue | 设备码：/ 打开浏览器 / 选择… / 继续 |
| `visual-card` | Figure / Invert brightness / Download as SVG / Open fullscreen | 图 / 反转亮度 / 下载为 SVG / 全屏查看 |
| `demo-card` | Invert demo brightness / Download as HTML / This demo threw an error | 反转演示亮度 / 下载为 HTML / 此演示抛出了错误 |
| `image-card` | Image / Download image / Open image fullscreen | 图片 / 下载图片 / 全屏查看图片 |
| `claude-code-status` | Check again / Setup ↗ / 两条长说明 | 重新检查 / 设置 ↗ / 中文说明 |
| `keys-section` | Deepgram API key / Retry / Allow reuse… / Reload configuration | Deepgram API 密钥 / 重试 / 允许复用… / 重新加载配置 |
| `agent-section` | Model catalog could not be loaded / Cache: default / Add folder | 模型目录加载失败 / 缓存：默认 / 添加文件夹 |
| `settings-dialog` | Settings(aria) / Close / Loading plugins… | 设置 / 关闭 / 正在加载插件… |
| `message` | Previous branch / Next branch | 上一个分支 / 下一个分支 |
| `steer-card` | Background job recovery failed / Research | 后台任务恢复失败 / 调研 |
| `job-card` / `live-tool-card` / `plugin-worker-card` / `svg-image` | Sources / Input (streaming) / Task details / Figure | 来源 / 输入（流式）/ 任务详情 / 图 |
| `plugin-chrome` / `plugin-knowledge-picker` / `plugin-question-dock` | Extract / Search nodes / Pick nodes / Your thinking / Dismiss question | 提取 / 搜索节点 / 选择节点 / 你的思考 / 忽略此题 |
| `setup-dialog` / `citation-comment-editor` / `delete-source-dialog` / `graph-view` / `model-picker` / `notes-import` / `plugin-problem-submitted` / `plugin-renderers` / `cache-retention-menu` / `plugins-section` / `source-folder-tree` / `update-settings` | Close / Cancel / Try again / Blur / Levels this model supports / attach material hint / Problem unavailable / Question unavailable / Cache retention / Loading plugins / Rename / auto update | 全部中文 |

### 插件层（24 处）

| 插件 | 文案 | 中文 |
|------|------|------|
| `flashcards` | Decks… / Search decks, propositions, and cues / Delete selected / Converting file… / Preparing generation… | 牌组… / 搜索牌组、命题与提示 / 删除所选 / 正在转换文件… / 正在准备生成… |
| `ui-showcase` | Reset / Type a local draft / Select first example / Open child dialog / Enable selection / Directory example 等 14 条 | 全部中文 |
| `drawing-pad` | Problem | 题目 |

### 代码健壮性修复

1. **崩溃修复**：`chat.tsx` 对已被 `freeze` 的 `inputViewReader` 赋值会抛 `object is not extensible`，已加保护。
2. **MISSING_MESSAGE 修复**：插件动作名不再由宿主翻译（插件自己本地化），消除了每帧 console 噪音。
3. **TS2589 修复**：`plugin-view-context.ts` 的深度泛型推断改为显式类型标注。
4. **Agnes 400 修复**：通过 `Model.compat` 显式声明 `requiresToolResultName: true`，工具调用不再 400。

## 三、明确不本地化的内容（设计决定）

| 类别 | 例子 | 理由 |
|------|------|------|
| 模型 ID / 提供商名 | `agnes-3.0-flash`、`Claude Code`、`Deepgram` | API 标识符，翻译会破坏调用 |
| 插件名称与描述 | `Flashcards`、`Coding questions` | 插件是独立分发包，自己负责本地化（已通过 `<html lang>` 实现） |
| 键盘按键名 | `Enter`、`Esc`、`Shift+Enter` | 物理按键，翻译会造成误导 |
| 技术错误原文 | `Invalid JSON body`、`Unknown chat` | 面向开发者的诊断信息，原文更利于排查；面向用户的拒绝信息已按 code 本地化 |
| 文件路径 / URL / CSS 变量 | `~/folder`、`var(--lh-prose-size)` | 机器标识符 |
| Next.js 开发指示器 | Route / Bundler / Turbopack | 仅 `npm run dev` 出现，生产构建不存在，且由 Next.js 自身控制 |

## 四、验证结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 类型检查 | `npx tsc --noEmit` | ✅ 主源码 0 错误 |
| 代码规范 | `npx eslint .` | ✅ 0 错误（1 个既有 warning） |
| 语言包一致性 | `node i18n/check-catalogs.mjs` | ✅ 628/628，0 差异 |
| 插件构建 | `npm run plugins:build-core` | ✅ 4 个插件全部成功 |

## 五、如何验证界面

```bash
npm run dev
# 打开 http://localhost:3000
# 设置 → 通用 → 语言 → 简体中文
```

若发现遗漏，把截图给我即可；也可运行：

```bash
node i18n/check-catalogs.mjs   # 检查语言包完整性
```
