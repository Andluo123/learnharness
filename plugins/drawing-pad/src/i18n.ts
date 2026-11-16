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
	"Drawing pad": "绘图板",
	"Draw (unsent)": "绘图（未发送）",
	"Draw": "绘图",
	"Undo drawing": "撤销绘图",
	"Toggle pen/eraser": "切换画笔/橡皮",
	"Hand": "平移",
	"Dark mode ink color": "深色模式墨色",
	"Light mode ink color": "浅色模式墨色",
	"Six-digit hex color. Recolors all unsent ink when this app theme mode is active.": "六位十六进制颜色。该主题模式启用时，会重绘所有未发送的墨迹。",
	"Image scale": "图像比例",
	"Export percentage (default 50%). Applied before the fixed 2000 × 2000 pixel cap. Does not affect on-screen appearance.": "导出百分比（默认 50%）。在固定的 2000 × 2000 像素上限之前应用。不影响屏幕显示效果。",
	"Drawing Pad resync failed; retaining existing work.": "绘图板重新同步失败；已保留现有内容。",
	"Drawing Pad is disabled.": "绘图板已禁用。",
	"Drawing is unavailable in this browser.": "此浏览器不支持绘图。",
	"Clear": "清除",
	"Undo": "撤销",
	"Redo": "重做",
	"Close": "关闭",
	"Problem": "题目"
};;

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
