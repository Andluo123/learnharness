"use client";
/**
 * The active UI locale on the client (zh-CN i18n wave).
 *
 * The root layout server-renders <html lang> from the settings record, so the
 * DOM attribute IS the authority after hydration. Reading it avoids threading
 * the locale through every component that needs it for DATA-shaped labels
 * (plugin names, which are not in the message catalog).
 *
 * SSR: falls back to the default locale; the value only affects display
 * strings that re-render on hydration anyway.
 */

import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "./config.ts";

export function useActiveLocale(): AppLocale {
	// Tests pin English exactly like i18n/request.ts does: the existing
	// assertions match the English catalog, and an isolated render has no
	// <html lang> to read anyway.
	if (process.env.NODE_ENV === "test") return "en";
	if (typeof document === "undefined") return DEFAULT_LOCALE;
	const lang = document.documentElement?.lang;
	return isAppLocale(lang) ? lang : DEFAULT_LOCALE;
}

/** The non-hook form, for module-level helpers and render paths that already
 *  know they run on the client. */
export function activeLocale(): AppLocale {
	return useActiveLocale();
}
