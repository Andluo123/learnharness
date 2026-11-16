# 探索笔记：LearnHarness 中文本地化 + Agnes 提供商

**探索时间**：2026-11-16
**被测对象**：`http://localhost:3000`（dev 模式，分支 `feat/i18n-zh-cn` @ `9776379`）
**环境**：Window 11 / Node 24.19 / Agnes key 已配置（51 字符）

---

## Charter

- **目标**：验证 6 个待验证项（Q1–Q6），确认中文本地化无功能缺陷、Agnes 提供商端到端可用
- **范围**：语言切换、Agnes 真实调用、工具调用、插件界面、错误处理
- **停点**：6 项全部有结论，或发现阻断性 Bug

---

## 系统理解

### 语言机制
```
data/settings.json → general.language
   ↓ (服务端每次请求读取)
app/layout.tsx → getLocale() → <html lang>
   ↓
I18nProvider → CatalogContext → useT() → 组件文案
```

### Agnes 链路
```
auth.json → AGNES_API_KEY
   ↓
piModels() → createAgnesProvider() → Model.compat
   ↓
POST api.agnes-ai.cn/v1/chat/completions
```

---

## 实测结论（逐项）

### ✅ Q3 语言切换 —— 通过
```
切换前 lang: zh-CN | 设置记录: zh-CN
切换到 en: 200 → lang: en | "New session": true
切回 zh-CN: 200 → lang: zh-CN | "新建会话": true
```
**结论**：中英双向切换即时生效，服务端记录与 HTML lang 同步。

### ✅ Q2 ICU 复数 —— 通过（此前误判）
独立测试 `createTranslator`：
```
en:  counts(3,5) → "3 chains · 5 nodes"
zh:  counts(3,5) → "3 条推理链 · 5 个节点"
zh:  planWithNodes(3) → "计划 · 3 个节点"
```
**结论**：ICU 插值与复数都正常。此前看到的 `{chains}` 是语言包 JSON 被序列化进页面 `<script>`，不是用户可见文本。

### ✅ Q1 键名泄漏 —— 未发现
全局扫描 `>xxx.yyy.zzz<` 模式：**0 处**。
8 项中文抽样全部命中：新建会话、知识图谱、记忆卡片、设置、后台代理、语音输入、提取文件、推理链。

### ✅ Q5 Agnes 真实调用 —— 通过（但发现我此前的修复是错的）

**关键发现：我此前对 400 的根因判断错误。**

实测对照实验：

| 场景 | 结果 |
|------|------|
| tool 消息**带** name | 200 |
| tool 消息**不带** name | **200** ← name 根本不是必需的 |
| tool 消息**缺 tool_call_id** | **400** ← 真正的触发条件 |
| tool_call_id 对不上 | 200 |
| assistant 无 tool_calls 但后面跟 tool 消息 | 200 |

原始错误全文：
```
Invalid JSON data: Failed to deserialize the JSON body into the target type:
messages[2]: missing field `tool_call_id` at line 1 column 229
```

**真实根因**：pi-ai 的 `openai-completions.js` 这样构造：
```js
const toolResultMsg = {
  role: "tool",
  content: ...,
  tool_call_id: toolMsg.toolCallId,   // 若为 undefined
};
```
`JSON.stringify({tool_call_id: undefined})` → `{"role":"tool","content":"ok"}`
**字段被整个丢弃** → 端点报 missing field。

**已修正**：`requiresToolResultName: true` → `false`（基于实测，不再凭推断），并在代码注释中记录实验数据。

**端到端验证通过**：
- 6 轮工具调用 → 200，模型正确汇总
- 应用内真实对话 → HTTP 200，会话记录 2 条消息，Agent 返回完整中文回答
- `/api/models` → agnes `keyPresent=true`，模型 `agnes-3.0-flash` 可用

### ⏳ Q4 Electron 菜单 —— 未验证
需要打包或启动 Electron 才能观察原生菜单，本次环境未做。

### ✅ Q6 中文输入法 —— 已发现并修复真实 Bug

**BUG-002（已修复）：主输入框缺少 IME 防护**

代码审查发现：`path-input.tsx` 有完整防护（`isComposing` + `keyCode === 229`），但**其他 8 个面向用户的输入框都没有**。

后果：中文用户用输入法打「你好」，按 Enter 选词时**消息会被误发送**，发出去的是半成品。

已修复的文件：
| 文件 | 场景 |
|------|------|
| `composer.tsx` | 会话主输入框 |
| `home.tsx` | 首页「你想学习什么」 |
| `question-dock.tsx`（2 处） | 题目作答、思考字段 |
| `practice-dock.tsx` | 练习作答 |
| `reading-thinking.tsx`（2 处） | 阅读思考字段 |
| `source-folder-tree.tsx` | 来源重命名 |

`plugin-question-dock.tsx` 已有 `composingQuestionKey()` 防护，未改动。

**验证**：98/98 测试通过。

---

## 风险清单

| # | 风险 | evidence | confidence |
|---|------|----------|-----------|
| R-A | **IME 组字时 Enter 可能误提交**（`keydown` 未检查 `isComposing`） | E2 代码审查：`composer.tsx` / `enter-submits.ts` 未见 isComposing 判断 | medium |
| R-B | Electron 原生菜单中文未实测 | E1 仅语法检查 | medium |
| R-C | 语言切换后插件是否重渲染未测（插件读 `document.lang`，推测需刷新） | E2 代码推断 | low |
| R-D | 中文长文案在窄窗口可能截断 | E0 未观测 | low |

---

## 测试想法（后续可转用例）

| 想法 | 归属 |
|------|------|
| IME 组字期间 Enter 行为验证 | 需人工，转 `test-case-writing` |
| 每个设置分区的中文布局（窄窗口 640px） | 转 `automated-e2e-testing`（视觉） |
| 语言切换后插件重渲染 | 转用例 |
| Agnes 工具调用在应用内多轮 | 已手动验证，可转 API 测试 |

---

## 发现的 Bug

### BUG-001（已修复）：Agnes compat 配置基于错误推断
- **现象**：代码声明 `requiresToolResultName: true`，理由是"端点要求 name 字段"
- **实测**：端点不要求 name；真正的 400 是 `tool_call_id` 为 undefined 时被 JSON 丢弃
- **影响**：多发了端点不要求的字段（无害但误导），且注释把运维引向错误方向
- **修复**：改为 `false`，注释记录实测数据
- **状态**：已修复，40/40 测试通过

### 无发现其他功能缺陷
- 语言切换、ICU 插值、键名、Agnes 端到端、工具调用均正常

---

## 未解之谜

1. Q4 Electron 菜单 — 需要启动 Electron
2. Q6 IME 行为 — 需要人工测试
3. R-A 是否为真实缺陷？取决于 `enter-submits.ts` 是否已有防护（待确认）
