"use client";
/**
 * useT — the app's translation hook (zh-CN i18n wave).
 *
 * Reads the active catalog from CatalogContext (default: English) and
 * returns a next-intl translator bound to an optional namespace:
 *
 *   const t = useT("sidebar");
 *   t("newSession")            → "New session" / "新建会话"
 *   t("timeAgoDays", {count})  → ICU interpolation / plurals
 *
 * Full dotted paths work too: useT() then t("a.b").
 *
 * TYPE NOTE: the catalog is deliberately typed as a loose message map
 * (Record<string, unknown>) so keys are plain strings — this app's
 * catalogs are hand-authored and grow per wave; per-key literal typing
 * would require generating declarations and buys nothing here. The
 * runtime is next-intl's own translator, so formatting semantics are
 * identical to the framework hooks.
 */

import { useContext, useMemo } from "react";
import { createTranslator } from "next-intl";
import { CatalogContext, LocaleContext } from "./catalog-context.ts";

export type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

export function useT(namespace?: string): TranslateFn {
	const messages = useContext(CatalogContext);
	const locale = useContext(LocaleContext);
	return useMemo(() => {
		const translator = createTranslator({
			locale,
			messages: messages as never,
			...(namespace ? { namespace: namespace as never } : {}),
		}) as unknown as TranslateFn;
		return translator;
	}, [messages, locale, namespace]);
}
