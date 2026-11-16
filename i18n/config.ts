/**
 * THE locale catalog (zh-CN i18n wave): the app's supported UI languages.
 * The active one lives in the settings record (general.language) — this
 * module is the single source for ids, labels, and the default.
 *
 * Browser-safe: pure constants only, no node imports (the settings
 * sanitizer, the client provider, and the server request config all
 * import it).
 */

export const LOCALES = ["zh-CN", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

/** First boot (no general.language in the record) resolves here. */
export const DEFAULT_LOCALE: AppLocale = "zh-CN";

/** Native language names for the settings picker — each shown in its own
 *  language so a user who mis-set the UI can always find their way back. */
export const LOCALE_LABELS: Readonly<Record<AppLocale, string>> = {
	"zh-CN": "简体中文",
	en: "English",
};

/** The <html lang> attribute value for a locale. */
export const HTML_LANG: Readonly<Record<AppLocale, string>> = {
	"zh-CN": "zh-CN",
	en: "en",
};

export function isAppLocale(value: unknown): value is AppLocale {
	return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
