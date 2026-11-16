/**
 * Error-message localization (zh-CN i18n wave).
 *
 * WHY A SEPARATE TABLE: error strings are THROWN from logic layers
 * (session-core, plugin-manager, hooks) where React hooks cannot run. Rather
 * than thread a translator through every throw site — which would couple
 * transport code to presentation — the DISPLAY layer maps the known English
 * message to the active language on its way to the banner.
 *
 * Contract: an unmapped message passes through verbatim. That is deliberate:
 * a server diagnostic or an unknown failure must never be replaced by a
 * generic phrase, because the operator needs the real text.
 *
 * Keys are the EXACT English strings thrown in components ts logic files.
 * throw site's wording changes, its entry here stops matching — the message
 * falls back to English rather than to a wrong translation.
 */

import type { AppLocale } from "./config.ts";

/** English (thrown) → Simplified Chinese. Keep the English side verbatim. */
export const ERROR_MESSAGES_ZH: Readonly<Record<string, string>> = {
	// session-core
	"The connection dropped before the turn completed.": "本轮完成前连接已断开。",
	"Could not sync the saved session.": "无法同步已保存的会话。",
	"Canonical read was invalidated.": "该读取已失效，请刷新重试。",
	"The dismissal failed.": "忽略操作失败。",
	"The turn stream body is empty.": "本轮数据流为空。",
	"An error occurred.": "发生了一个错误。",
	"The tool call failed.": "工具调用失败。",
	"Failed to attach to the running turn.": "无法连接到正在运行的本轮。",
	"A turn is already running — try again in a moment.": "本轮仍在运行 —— 请稍后再试。",
	// chat / composer
	"Thinking text or images are required. Your input has been kept.": "请填写思考内容或添加图片。你的输入已保留。",
	"Message text or images are required. Your input has been kept.": "请填写消息内容或添加图片。你的输入已保留。",
	"This session view is no longer active.": "此会话视图已不再活跃。",
	// side thread
	"The side conversation could not be reached.": "无法连接侧边对话。",
	"The side answer had no response stream.": "侧边回答没有返回数据流。",
	"The side answer failed.": "侧边回答失败。",
	"The side answer disconnected. Reopen the conversation to reconnect.": "侧边回答已断开。重新打开对话以重连。",
	// subscription client
	"Subscription status is unavailable.": "订阅状态不可用。",
	"The subscription connection could not be changed.": "无法更改订阅连接。",
	"Allow a sign-in tab to open, then try again.": "请允许打开登录标签页后重试。",
	"Invalid sign-in action.": "无效的登录操作。",
	"The sign-in tab was closed. Cancel and try again.": "登录标签页已关闭。请取消后重试。",
	// images
	"Image snapshot unavailable": "图片快照不可用",
	"Invalid image snapshot": "图片快照无效",
	// notes import
	"Invalid import response. Check the graph before retrying.": "导入响应无效。请先检查知识图谱再重试。",
	// graph / sources
	"Could not read source organization.": "无法读取来源的整理信息。",
	"Could not read knowledge graph.": "无法读取知识图谱。",
	"Folder removal is unavailable.": "文件夹移除不可用。",
	// plugins
	"Problem is no longer ready": "题目已不再就绪",
	"Question is no longer ready": "题目已不再就绪",
	"Surface target is no longer active": "目标界面已不再活跃",
	"Plugin is no longer active": "插件已不再活跃",
	"Plugin UI host is unavailable": "插件界面宿主不可用",
	"Plugin stylesheet could not be loaded": "插件样式表加载失败",
	"Submission preparation canceled": "提交准备已取消",
	"Unable to load custom configuration.": "无法加载自定义配置。",
	// Status-suffixed throw sites; matched by prefix + status code.
	"The send failed": "发送失败",
	"The steer failed": "引导失败",
	"The dismissal failed": "忽略操作失败",
	"Request failed": "请求失败",
};

/** Localize a thrown message for display. Unknown text passes through. */
export function localizeError(message: string, locale: AppLocale): string {
	if (locale === "en") return message;
	const direct = ERROR_MESSAGES_ZH[message];
	if (direct) return direct;
	// Status-suffixed variants: "... (404)", "Request failed (500)"
	const withStatus = message.match(/^(.*) \((\d{3})\)\.?$/);
	if (withStatus) {
		const head = withStatus[1];
		const status = withStatus[2];
		if (head !== undefined && status !== undefined) {
			const base = ERROR_MESSAGES_ZH[head];
			if (base) return `${base}（${status}）`;
		}
	}
	// "Your input has been kept." tails
	for (const [en, zh] of Object.entries(ERROR_MESSAGES_ZH)) {
		if (message.startsWith(en)) return message.replace(en, zh);
	}
	return message;
}
