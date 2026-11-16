# i18n 本地化改造规范（zh-CN）

本文件是 LearnHarness 中文本地化改造的执行规范。所有组件改造必须严格遵守。

## 架构

- 语言状态存在 `data/settings.json` 的 `general.language`（"zh-CN" | "en"）。
- 服务端：`app/layout.tsx` 通过 `getLocale()/getMessages()` 读取，注入 `<I18nProvider>`。
- 客户端组件：**一律使用 `useT()`**（来自 `@/i18n/use-t.ts`），不要直接用 next-intl 的 `useTranslations`。

## 组件改造范式

```tsx
"use client";
import { useT } from "@/i18n/use-t.ts";

export function MyDialog() {
  const t = useT("myDialog");   // 命名空间 = 语言包中的一级 key
  return (
    <div>
      <h2>{t("title")}</h2>
      <button aria-label={t("close")}>{t("cancel")}</button>
    </div>
  );
}
```

### 关键规则

1. **不要给纯函数加 hook**。`timeAgo` 这类纯函数/导出辅助函数必须是 `(…, t?: TranslateFn)` 可选参数形式，
   内部提供英文默认值（参见 `components/sidebar.tsx` 的 `timeAgo`/`sessionMeta`），这样 79 个
   `renderToStaticMarkup` 测试无需 Provider 也能通过。
2. **测试安全**：`useT()` 在无 Provider 时返回英文目录（CatalogContext 默认值），因此现有英文断言不变。
3. **英文文案必须与改造前逐字一致**（包括省略号 `…`、弯引号 `’`、大小写），否则测试会失败。
4. **不要本地化**：`className`、`data-testid`、`aria` 之外的属性值、API 路径、CSS 变量、
   键盘按键名（Enter/Escape/ArrowDown）、模型 ID、提供商名称、URL、文件路径。
5. **要本地化**：JSX 文本节点、`placeholder`、`aria-label`、`title`、`alt`、
   可见的 `<Button>` 内容、`role="status"` 文案、错误/空状态提示、菜单项标签。
6. **插值**用 next-intl ICU 语法：`t("greeting", { name })` → 语言包 `"greeting": "Hello, {name}"`。
7. **复数**用 ICU：`"count": "{count, plural, one {# item} other {# items}}"`。

## 命名空间规则（务必遵守）

`useT(ns)` 的 `ns` 就是语言包的一级 key，`t(k)` 的 `k` 是**该命名空间内**的路径，不要重复写命名空间。

```tsx
const t = useT("dialog");      // 语言包: { "dialog": { "deleteNodeQuestion": "..." } }
t("deleteNodeQuestion")        // ✅ 正确
t("dialog.deleteNodeQuestion") // ❌ 错误 —— 会输出 "dialog.deleteNodeQuestion"
```



- `i18n/messages/en.json` — 英文（与现有硬编码字符串逐字一致）
- `i18n/messages/zh-CN.json` — 简体中文

两者**必须拥有完全相同的 key 结构**。所有 key 均为一级命名空间 + 驼峰子键，
例如 `"settings": { "title": "Settings", "close": "Close settings" }`。

## 中文文案风格

- 使用简洁、自然的简体中文，避免直译腔。
- 专有名词保留英文：LearnHarness、GitHub、PDF、API、Claude Code、Tavily、Brave、Exa、Ollama、FSRS。
- 按钮用动词短语（"保存"、"开始会话"），不用"I/We"。
- 省略号统一用 `…`（与英文一致）。
- 不要用"您"，统一用"你"。

## 完成后自检

1. `npx tsc --noEmit 2>&1 | Select-String "error TS" | Where-Object { $_ -notmatch "plugins/" }` 无输出。
2. `NODE_ENV=test npx tsx --test tests/<相关测试>.test.tsx` 全部通过。
3. `i18n/messages/en.json` 与 `zh-CN.json` 的 key 结构一致。

## 常见陷阱

1. **命名空间重复**：`useT("x")` 后再写 `t("x.foo")` 会输出原始键名。正确是 `t("foo")`。
2. **hook 放错组件**：多组件文件（如 `DeleteSessionDialog` + `DeleteSessionBody`）里，
   `t` 必须在**使用它的那个组件**内声明，不能只放在外层。
3. **import 插错位置**：多行 import（`import {\n a,\n b\n} from ...`）中间插入会破坏语法。
   插入点应在**最后一个以 `;` 结尾的 import 之后**。
4. **纯函数内调用 hook**：绝对禁止。用可选参数 `t?: TranslateFn` + 英文默认值。
