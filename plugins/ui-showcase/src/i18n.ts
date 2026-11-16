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
	"Pickers": "选择器",
	"Thinking for this model": "此模型的思考等级",
	"Knowledge selection": "知识点选择",
	"Composer": "输入框",
	"Independent composer": "独立输入框",
	"Type a local draft": "输入本地草稿",
	"Complete simulation": "完成模拟",
	"Dictation": "语音输入",
	"Host dictation control": "宿主语音输入控件",
	"Dictate": "开始语音",
	"Finish dictation": "结束语音",
	"Cancel dictation": "取消语音",
	"Standard composer": "标准输入框",
	"Independent local draft": "独立本地草稿",
	"Host standard composer": "宿主标准输入框",
	"Buttons": "按钮",
	"Neutral": "中性",
	"Tests passed": "测试通过",
	"Tests failed": "测试失败",
	"With hints": "带提示",
	"Disabled": "已禁用",
	"Settings rows": "设置行",
	"Example": "示例",
	"Toggle example": "开关示例",
	"A local boolean value.": "一个本地布尔值。",
	"Text example": "文本示例",
	"Cancel": "取消",
	"Close": "关闭",
	"Reset": "重置",
	"First option": "第一个选项",
	"Select first example": "选择第一个示例",
	"Disabled example": "禁用示例",
	"Select second example": "选择第二个示例",
	"Open child dialog": "打开子对话框",
	"Retained text": "保留的文本",
	"UI Showcase surface": "组件示例库面板",
	"Open nested surface": "打开嵌套面板",
	"Nested UI Showcase surface": "嵌套组件示例库面板",
	"Enable selection": "启用选择",
	"Directory example": "目录示例",
	"UI Showcase": "组件示例库",
	"Directory draft": "目录草稿"
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
