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
	"Coding answers must be strings.": "编程答案必须是字符串。",
	"Coding submissions must be strings.": "编程提交必须是字符串。",
	"Coding question": "代码练习",
	"Coding problem": "编程问题",
	"Coding question payload is unavailable.": "编程题内容不可用。",
	"Coding question test recipe is unavailable.": "编程题测试配置不可用。",
	"Coding question test recipe is invalid.": "编程题测试配置无效。",
	"JavaScript": "JavaScript",
	"TypeScript": "TypeScript",
	"Syntax problem.": "语法问题。",
	"Code answer": "代码答案",
	"Submitted code": "已提交的代码",
	"Plain text": "纯文本",
	"Loading highlighting…": "正在加载语法高亮…",
	"Saved test result is unavailable.": "已保存的测试结果不可用。",
	"Tests passed": "测试通过",
	"Tests failed": "测试失败",
	"Could not run tests": "无法运行测试",
	"Test output": "测试输出",
	"Test run aborted": "测试已中止",
	"Test process exceeded the 30 second timeout": "测试进程超过 30 秒超时",
	"Run tests": "运行测试",
	"Running…": "运行中…",
	"Cancel": "取消",
	"Close": "关闭",
	"Hide": "隐藏"
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
