/** Plugin UI localization (zh-CN i18n wave).
 *
 *  Plugins are bundled independently and cannot import the host's next-intl
 *  catalogs. The active UI language reaches them through the document —
 *  the host sets <html lang> from the settings record — so this module
 *  reads that once per call and resolves a small plugin-local dictionary.
 *
 *  Design rules:
 *  - English strings are the source of truth for keys: `t("Reveal answer")`
 *    looks up the exact English text. That keeps every existing call site
 *    readable and means a missing translation degrades to English rather
 *    than to a key.
 *  - Unknown strings pass through unchanged (never "undefined").
 *  - No build step, no async, no host API needed.
 */

const ZH: Record<string, string> = {
	"Chemical structures": "化学结构",
	"Musical notation": "乐谱",
	"Technical diagrams": "技术图表",
	"Write explanations outside the block. Author notation, not raw SVG, JavaScript, or external resources.": "在代码块之外写解释。请编写记法，而不是原始 SVG、JavaScript 或外部资源。",
	"Rich code blocks is disabled.": "富代码块已禁用。",
	"Unsupported code-block language.": "不支持的代码块语言。",
	"Rendering cancelled.": "渲染已取消。",
	"The TeX worker failed.": "TeX worker 执行失败。",
	"Close": "关闭",
	"Copy source": "复制源码"
};

/** The active UI language as the host declares it. */
export function uiLocale(): "zh-CN" | "en" {
	const lang = typeof document !== "undefined" ? document.documentElement?.lang : "";
	return typeof lang === "string" && lang.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Translate one plugin string. English input is the key. */
export function t(text: string): string {
	if (uiLocale() !== "zh-CN") return text;
	return ZH[text] ?? text;
}
