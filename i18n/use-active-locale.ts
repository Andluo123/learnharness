"use client";
/**
 * The active UI locale on the client (zh-CN i18n wave).
 *
 * THE SOURCE IS THE PROVIDER, NOT THE DOM. An earlier version read
 * document.documentElement.lang directly. That is not reactive: after a
 * language switch the provider re-renders with the new value while the
 * attribute update and the render disagree for a frame, and components
 * that read the DOM kept the PREVIOUS language — plugin names came out in
 * the opposite language from the rest of the UI.
 *
 * LocaleContext is React state threaded from the server layout
 * (next-intl's getLocale over the settings record), so reading it here
 * means one value, one origin, updated in the same commit as every other
 * translated string.
 *
 * Its context default is "en", which doubles as the test default: isolated
 * renders have no provider and the existing assertions expect English.
 */

import { useContext } from "react";
import { DEFAULT_LOCALE, type AppLocale } from "./config.ts";
import { LocaleContext } from "./catalog-context.ts";

export function useActiveLocale(): AppLocale {
	return useContext(LocaleContext) ?? DEFAULT_LOCALE;
}
