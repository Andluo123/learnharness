# 简体中文本地化（i18n）

LearnHarness 现已完整支持简体中文界面。本文档说明架构、扩展方式与已知边界。

## 快速使用

打开 **设置 → 通用 → 语言**，在「简体中文」与「English」之间切换。切换立即生效，无需重启。

## 覆盖范围

| 区域 | 状态 |
|------|------|
| 核心 Web 界面（`app/` + `components/`） | ✅ 完整 |
| 5 个内置插件 UI（flashcards / coding-questions / drawing-pad / rich-code-blocks / ui-showcase） | ✅ 主要界面 |
| Electron 原生菜单 | ✅ 完整 |
| AI 代理的教学语言 | ✅ 通过提示词指令注入 |
| 服务端错误信息 | ✅ 按 `code` 本地化 |
| 页面标题与描述（metadata） | ✅ 完整 |

## 架构

```
data/settings.json  general.language: "zh-CN" | "en"
        │
        ├─ app/layout.tsx  (服务端)
        │     ├─ getLocale() / getMessages()   ← i18n/request.ts
        │     ├─ <html lang="zh-CN">
        │     └─ <I18nProvider locale messages>
        │              └─ CatalogContext (默认值 = 英文目录)
        │                       └─ useT()  ← 客户端组件
        │
        ├─ electron/menu-language.cjs  (原生菜单，独立小字典)
        ├─ src/agent/teaching-language.ts  (AI 教学语言指令)
        └─ plugins/*/src/i18n.{js,ts}  (插件内独立字典 + document.lang)
```

### 关键设计决策

**1. 无 URL 前缀。** 语言存在 `settings.json` 而不是 URL 里，因此 Electron 桌面壳加载的固定地址、所有内部链接与 `/api` 调用都不受影响。

**2. `useT()` 而非直接使用 `useTranslations()`。** `useT()` 读取的是应用自己的 `CatalogContext`，其**默认值是英文目录**。这样即使组件在无 Provider 的环境下渲染（79 个 `renderToStaticMarkup` 测试正是如此），也会回退到英文，而不是抛 `MISSING_PROVIDER`。生产环境通过 `<I18nProvider>` 注入当前语言。

**3. 测试固定英文。** `i18n/request.ts` 在 `NODE_ENV=test` 时强制 `en`，因此 419 个现有测试中硬编码的英文断言（如 `aria-label="Close settings"`）无需任何修改。

**4. 提示词保持英文。** `src/agent/prompts/` 与 `system-prompt.md` 完全未改动，便于与上游合并。教学语言通过 `withTeachingLanguage()` 在组装末尾追加一段中文指令实现，可随时切回。

## 新增一条文案

1. 在 `i18n/messages/en.json` 与 `zh-CN.json` 的同一命名空间下添加键（两文件结构必须一致）。
2. 组件中：

```tsx
import { useT } from "@/i18n/use-t.ts";

export function MyComponent() {
  const t = useT("myNamespace");
  return <button aria-label={t("close")}>{t("save")}</button>;
}
```

3. 校验：

```bash
node i18n/check-catalogs.mjs     # 键一致性
npx tsc --noEmit                 # 类型
```

### 命名空间规则（重要）

`useT(ns)` 的 `ns` 是语言包的一级 key，`t(k)` 的 `k` 是该命名空间**内部**的路径：

```tsx
const t = useT("dialog");
t("deleteNodeQuestion")        // ✅
t("dialog.deleteNodeQuestion") // ❌ 会输出原始键名
```

### 纯函数不要用 hook

导出给测试用的纯函数必须用可选参数 + 英文默认值：

```ts```
export function timeAgo(iso: string, now = new Date(), t?: TranslateFn): string {
  const tr = t ?? defaultEnglishTranslator;
  ...
}
```

## 插件本地化

插件独立打包，无法 import 宿主语言包。它们通过 `<html lang>` 读取语言，并在插件目录内自备小字典：

```js
import { t } from './i18n.js';
button.textContent = t("Reveal answer");  // 英文原文即 key；缺失则回退英文
```

## 附带的提供商扩展：Agnes AI

本次改动还注册了一个内置提供商 **Agnes AI**（`agnes-3.0-flash`），OpenAI 兼容：

| 项 | 值 |
|----|-----|
| Base URL | `https://api.agnes-ai.cn/v1` |
| 模型 | `agnes-3.0-flash`（Agnes 3.0 Flash） |
| 上下文 | 512,000 tokens |
| 最大输出 | 65,536 tokens |
| 输入模态 | 文本、图像 URL |
| 密钥环境变量 | `AGNES_API_KEY` |

配置方式：**设置 → 服务提供商 → Agnes AI**，粘贴 API Key 即可；密钥填入后其模型会立即出现在所有槽位选择器中。

实现位置：`src/agent/agnes/provider.ts`（提供商标工厂与模型目录）、`src/agent/models.ts`（`piModels()` 注册）、`src/core/auth-keys.ts`（密钥行）。`tests/auth-provider-keys.test.ts` 的 no-drift 门禁已扩展为「pi-ai 的每个提供商都必须存在，额外的行必须出现在显式 `APP_PROVIDED` 白名单中」。

## 已知边界

- **AI 输出质量** 取决于所选模型的中文能力；提示词已明确要求用简体中文并保留专有名词原文。
- **插件错误信息**（如 `Could not encode your drawing`）多为内部诊断，未全部翻译；用户可见的主要界面已覆盖。
- **`verify-release.test.ts`** 在 Windows 上存在与本次改动无关的既有失败（`ERR_UNSUPPORTED_ESM_URL_SCHEME`），已在原始提交上复现。
