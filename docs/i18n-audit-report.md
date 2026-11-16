# 本地化彻底审计报告

审计时间：2026-11-16 08:45:02
语言包：**774 个键**，中英逐键对齐

---

## 一、代码级审计（覆盖 6 种文案写法）

扫描了 `components/**/*.tsx` 中所有**未走 `t()` 的可见英文**，检查模式包括：

| 写法 | 示例 |
|------|------|
| JSX 文本节点 | `<span>Cost</span>` |
| 属性字面量 | `label="Background"` |
| 三元表达式 | `cond ? "Cancel" : "Close"` |
| 对象属性 | `{ label: "Strong" }` |
| 模块级常量 | `const COPY = { title: "..." }` |
| 纯函数返回值 | `return scope === "app" ? "App-wide" : ...` |

### 审计结果

| 轮次 | 发现 | 处理 |
|------|------|------|
| 第 1 轮 | 97 条（含 30 条 TS 类型误报） | 过滤得 67 条真实 |
| 第 2 轮 | 5 条 | 全部修复 |
| **最终** | **0 条** | ✅ 清零 |

### 本轮修复清单（67 条）

| 文件 | 修复内容 |
|------|---------|
| `side-thread` | 追问/侧边问题占位符、停靠/浮动、固定/取消固定、语音输入开关（11 条） |
| `abort-turn-dialog` | 中止/忽略/放弃三种模式的标题、说明、按钮（9 条） |
| `setup-dialog` | 选择提供商、保存密钥、保存模型 |
| `session-overlay` | 图片/图表、适应窗口 |
| `question-dock` | 讲解/问题标签、我不知道 |
| `chatgpt-connection` | 断开账户确认、吊销警告 |
| `artifacts/*-card` | 快照加载失败、加载中 |
| `stats-bar` / `activity-dock` | 用量/总花费、成本 |
| 其余 20+ | 见提交记录 |

### 特殊场景的处理方式

发现 4 处**模块级纯函数/常量**不能用 hook，改为**可选 translator 参数**：

```ts
// 之前：模块级常量里直接调 t() → 运行时崩溃
const COPY = { title: t("abortTurnTitle") };

// 现在：常量存 KEY，渲染时解析
const COPY_KEYS = { turn: { titleKey: "abortTurnTitle" } };
export function abortCopy(mode, t) { ... }

// 纯函数：可选参数 + 英文回退
export function sideThreadPlaceholder(state, translate?) { ... }
```

涉及：`abort-turn-dialog`、`plugin-shortcuts`、`chatgpt-connection`、`side-thread`

---

## 二、译文专业性审计

### 1. 术语一致性（修正 3 处）

| 概念 | 修正前 | 修正后 | 理由 |
|------|--------|--------|------|
| **chain** | 链路 / 推理链（混用） | **推理链**（统一） | 与 `everyReasoningChain`「所有推理链」一致；且「推理链」准确表达 premises → conclusion 的论证结构 |
| **turn** | 回合 / 轮次（混用） | **回合**（统一） | 「回合」是对话系统的标准术语 |
| **provider** | 服务提供商 / 提供商（混用） | **提供商**（正文）/ 服务提供商（分区标题） | 简化正文，标题保留完整表达 |

### 2. 英文残留检查（12 条，全部合理）

| 类别 | 例子 | 处理 |
|------|------|------|
| 专有名词 | Claude Code、ChatGPT、FSRS-6、TikZ | ✅ 保留原文 |
| 按键名 | Enter、Shift、Escape、Tab | ✅ 保留（物理按键） |
| 插值变量 | `{label}`、`{title}`、`{chains}` | ✅ 保留（运行时替换） |
| 文件路径 / URL | `data/`、`dist/`、`http://localhost:11434/v1` | ✅ 保留 |

### 3. 长句流畅度（9 条，逐条审视）

全部通过。示例：

> **EN**: This permanently removes the session — its messages, background jobs, and extraction records...
> **ZH**: 这将永久删除该会话 —— 包括它的消息、后台任务与提取记录。除非勾选下方选项，否则它加入知识图谱的内容会保留。此操作无法撤销。

### 4. 生硬译文检查（8 条含「一个」）

均判定为自然中文，无需修改：
- 「开始**一个**会话，即可着手学习」
- 「**一个**临时性的画廊」

### 5. 优化 1 处

| 键 | 修改前 | 修改后 |
|----|--------|--------|
| flashcards 描述 | 生成事实回忆**提示** | 生成事实回忆**卡片** |

（cue 在此语境即卡片本身，用「卡片」更贴合产品名「记忆卡片」）

---

## 三、插件名专业化（前一轮已完成）

| 原名 | 旧译 | 新译 | 依据 |
|------|------|------|------|
| Flashcards | 闪卡 | **记忆卡片** | 口语直译 → 按 FSRS-6 记忆系统命名 |
| Coding questions | 编程题 | **代码练习** | 「题」只覆盖提问，未含动手练习 |
| Rich code blocks | 富代码块 | **学科代码块** | rich 指学科记号（化学/音乐/图表），非 rich text |
| UI Showcase | 界面展示 | **组件示例库** | 是开发者参考库，非界面展示 |
| Drawing Pad | 绘图板 | 绘图板 | 已准确 |

---

## 四、验证结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| TypeScript | `npx tsc --noEmit` | ✅ 0 错误 |
| 语言包一致性 | `node i18n/check-catalogs.mjs` | ✅ 774/774，0 差异 |
| 代码级审计 | 6 种写法全扫描 | ✅ **0 条未本地化** |
| 组件测试 | `npx tsx --test` | ✅ 122/122 |
| 服务 | `npm run dev` | ✅ 200 OK |

---

## 五、覆盖范围总结

| 层面 | 状态 |
|------|------|
| 核心 Web UI（`components/` + `app/`） | ✅ 100% |
| 5 个插件的 UI 与设置项 | ✅ 100% |
| 插件名称与描述 | ✅ 100%（专业化命名） |
| Electron 原生菜单 | ✅ 100% |
| 页面 metadata | ✅ 100% |
| AI 教学语言 | ✅ 通过提示词指令注入 |
| 服务端用户可见错误 | ✅ 按 `code` 本地化 |

### 明确不本地化（设计决定）

| 内容 | 理由 |
|------|------|
| 模型 ID / API 标识符 | 翻译会破坏调用 |
| 键盘物理按键 | translate 会误导 |
| 服务端技术诊断信息 | 开发者排查用，原文更有用 |
| 文件路径 / URL / CSS 变量 | 机器标识符 |
| Next.js 开发指示器 | 生产环境不存在 |
