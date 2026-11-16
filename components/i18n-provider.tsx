"use client";
/**
 * THE i18n client provider (zh-CN i18n wave).
 *
 * Two layers, deliberately:
 *  1. CatalogContext/LocaleContext (i18n/catalog-context.ts) — the app's
 *     own seam. Its DEFAULT is the English catalog, so an isolated render
 *     (every render test, any stray subtree) still translates without a
 *     provider. useT() reads these.
 *  2. NextIntlClientProvider — the framework provider, so next-intl's own
 *     hooks (useTranslations/useFormatter/useLocale inside plugins and any
 *     future code) work too.
 *
 * Switching language writes the settings record and refreshes the router;
 * the root layout re-reads the record server-side, so the SERVER tree and
 * the client catalog can never disagree.
 */

import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import type { AppLocale } from "@/i18n/config.ts";
import { CatalogContext, LocaleContext } from "@/i18n/catalog-context.ts";

interface LocaleSwitchValue {
	locale: AppLocale;
	setLocale: (next: AppLocale) => Promise<void>;
	pending: boolean;
}

const LocaleSwitchContext = createContext<LocaleSwitchValue | null>(null);

export function useLocaleSwitch(): LocaleSwitchValue {
	const value = useContext(LocaleSwitchContext);
	if (!value) throw new Error("useLocaleSwitch must be used inside <I18nProvider>");
	return value;
}

export function I18nProvider({
	children,
	locale,
	messages,
	timeZone,
}: {
	children: React.ReactNode;
	locale: AppLocale;
	messages: Record<string, unknown>;
	timeZone: string;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	const setLocale = useCallback(
		async (next: AppLocale) => {
			if (next === locale) return;
			const res = await fetch("/api/settings/general", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ language: next }),
			});
			if (!res.ok) throw new Error(`Failed to save language (${res.status})`);
			startTransition(() => router.refresh());
		},
		[locale, router],
	);

	const switchValue = useMemo(() => ({ locale, setLocale, pending }), [locale, setLocale, pending]);

	return (
		<LocaleSwitchContext.Provider value={switchValue}>
			<LocaleContext.Provider value={locale}>
				<CatalogContext.Provider value={messages}>
					<NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
						{children}
					</NextIntlClientProvider>
				</CatalogContext.Provider>
			</LocaleContext.Provider>
		</LocaleSwitchContext.Provider>
	);
}
