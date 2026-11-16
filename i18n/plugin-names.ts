/**
 * Plugin display names (zh-CN i18n wave).
 *
 * The manifest carries the plugin's ENGLISH name — that is DATA the plugin
 * ships, not UI copy this app authored. But the settings surface renders it
 * as UI (the nav row and the section heading), so the HOST must be able to
 * translate it. Names are keyed by plugin id under `settingsPlugins.plugin.<id>.name`.
 *
 * Fallback ladder: translated name → manifest name → plugin id. A plugin the
 * host has no translation for keeps its own English name, which is the honest
 * behavior (never an empty row, never a raw key).
 */

import type { AppLocale } from "./config.ts";

/** The catalogue the settings surface knows how to name. */
export const PLUGIN_NAMES: Readonly<Record<string, string>> = {
	flashcards: "记忆卡片",
	"coding-questions": "代码练习",
	"drawing-pad": "绘图板",
	"rich-code-blocks": "学科代码块",
	"ui-showcase": "组件示例库",
};

/** The display name for a plugin, in the active language.
 *
 *  `translate` must be the "settingsPlugins" section translator: the catalog
 *  keeps plugin identity under `settingsPlugins.plugin.<id>.name`, so the key
 *  passed down is `plugin.<id>.name` RELATIVE to that namespace. */
export function pluginDisplayName(
	id: string,
	manifestName: string | undefined,
	locale: AppLocale,
	translate?: (key: string) => string,
): string {
	// The manifest name is the plugin's own English identity; for English
	// there is nothing to resolve.
	if (locale === "en") return manifestName ?? id;
	// A shipped catalogue entry wins: it is curated and cannot be missing.
	// (Consulting the message catalog FIRST meant a test/third-party plugin
	// whose id has no entry received the raw key path as its name.)
	const shipped = PLUGIN_NAMES[id];
	if (shipped) return shipped;
	if (translate) {
		const key = `plugin.${id}.name`;
		const viaCatalog = translate(key);
		// use-intl echoes the key path when the message is missing.
		if (viaCatalog && viaCatalog !== key) return viaCatalog;
	}
	// Unknown plugin: its own manifest name is the honest answer.
	return manifestName ?? id;
}
