/** Native menu language (zh-CN i18n wave).
 *
 *  The Electron main process cannot import the renderer's next-intl
 *  catalog, so the handful of native menu labels live here — a deliberately
 *  tiny dictionary, not a second i18n system. The active language is READ
 *  from the same settings.json record the server uses (general.language),
 *  with the same tolerant fallback: absent/corrupt/unreadable → the factory
 *  default.
 *
 *  Keep the label set in sync with installMenu() in main.cjs.
 */

const fs = require("node:fs");
const path = require("node:path");

/** Mirrors i18n/config.ts DEFAULT_LOCALE. */
const DEFAULT_LOCALE = "zh-CN";
const LOCALES = ["zh-CN", "en"];

const LABELS = {
	"zh-CN": {
		checkForUpdates: "检查更新…",
		edit: "编辑",
		view: "视图",
		actualSize: "实际大小",
		zoomIn: "放大",
		zoomOut: "缩小",
		window: "窗口",
		undo: "撤销",
		redo: "重做",
		cut: "剪切",
		copy: "复制",
		paste: "粘贴",
		selectAll: "全选",
		reload: "重新加载",
		toggleDevTools: "开发者工具",
		toggleFullscreen: "全屏",
		about: "关于",
		hide: "隐藏",
		hideOthers: "隐藏其他",
		quit: "退出",
		services: "服务",
		subscriptions: "订阅",
	},
	en: {
		checkForUpdates: "Check for Updates…",
		edit: "Edit",
		view: "View",
		actualSize: "Actual Size",
		zoomIn: "Zoom In",
		zoomOut: "Zoom Out",
		window: "Window",
		undo: "Undo",
		redo: "Redo",
		cut: "Cut",
		copy: "Copy",
		paste: "Paste",
		selectAll: "Select All",
		reload: "Reload",
		toggleDevTools: "Toggle Developer Tools",
		toggleFullscreen: "Toggle Full Screen",
		about: "About",
		hide: "Hide",
		hideOthers: "Hide Others",
		quit: "Quit",
		services: "Services",
		subscriptions: "Subscriptions",
	},
};

/** The locale stored in settings.json, or the factory default. */
function readMenuLocale(dataDir) {
	let language;
	try {
		language = JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8"))?.general?.language;
	} catch {
		/* first boot / corrupt record */
	}
	return LOCALES.includes(language) ? language : DEFAULT_LOCALE;
}

/** The label set for a locale. */
function menuLabels(locale) {
	return LABELS[LOCALES.includes(locale) ? locale : DEFAULT_LOCALE];
}

module.exports = { DEFAULT_LOCALE, LOCALES, menuLabels, readMenuLocale };
