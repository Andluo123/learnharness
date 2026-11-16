/**
 * THE next-intl request config (zh-CN i18n wave): language WITHOUT URL
 * routing. The active locale comes from the settings record, read through
 * the server surface on every request (the record is per-machine disk
 * state; `connection()` in the root layout keeps routes dynamic, so this
 * read is never baked into a build-time prerender).
 *
 * Test discipline: NODE_ENV=test forces English so the existing tests
 * that assert English UI literals stay valid; the locale is still
 * switchable in production/dev.
 */

import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "./config.ts";
import type { UserSettings } from "../src/core/settings.ts";
import { createRequire } from "node:module";

/** The record reader, loaded synchronously. next-intl's request config is
 *  consumed by the Next server bundle, where a static import of the store
 *  would pull node:fs into every client-adjacent module; createRequire
 *  keeps the read synchronous without that graph cost. */
function requireSettings(): unknown {
	return createRequire(import.meta.url)("../src/store/settings.ts");
}

/** Static import map: bundlers (webpack/turbopack) must see literal
 *  specifiers, so each catalog is named explicitly rather than interpolated. */
const CATALOGS: Record<AppLocale, () => Promise<{ default: Record<string, unknown> }>> = {
	"zh-CN": () => import("./messages/zh-CN.json"),
	en: () => import("./messages/en.json"),
};

function recordLocale(): AppLocale {
	// Tests pin English: assertions in tests/*.test.ts(x) match the English
	// catalog verbatim. Never consult the record under NODE_ENV=test.
	if (process.env.NODE_ENV === "test") return "en";
	try {
		// Lazy dynamic import: this module is loaded by next-intl's request
		// config, which must stay importable without dragging node:fs into
		// client-adjacent seams.
		const { readSettings } = requireSettings() as {
			readSettings: () => UserSettings | null;
		};
		const record = readSettings();
		const language = record?.general?.language;
		if (isAppLocale(language)) return language;
	} catch {
		/* first boot / unreadable record: factory default */
	}
	return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
	const locale = recordLocale();
	return {
		locale,
		messages: (await CATALOGS[locale]()).default,
	};
});
