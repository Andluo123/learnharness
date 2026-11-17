"use client";
/**
 * THE language row (zh-CN i18n wave): the General section's language
 * picker. One segmented control over i18n/config.ts's LOCALES — each
 * option shows its NATIVE name so a user who mis-set the UI can always
 * find their own language again.
 *
 * The write path is the honest one: PUT /api/settings/general with the
 * whole section composed from the record, then a router refresh re-reads
 * the record server-side so next-intl serves the new catalog everywhere
 * (server components included) — never a client-only catalog swap.
 *
 * ROUTER SAFETY: useRouter() throws "invariant expected app router to be
 * mounted" outside a Next App Router tree, which is exactly how the SSR
 * settings tests mount this section. The refresh is therefore OPTIONAL:
 * absent router → the write still lands and the parent's own re-read
 * applies it on the next render.
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/i18n/use-t.ts";
import { LOCALES, LOCALE_LABELS, type AppLocale } from "@/i18n/config.ts";
import { SettingsRow } from "./controls.tsx";
import { cn } from "@/lib/utils";

/** Returns the router's refresh, or a no-op outside an App Router tree. */
function useOptionalRefresh(): () => void {
	let router: ReturnType<typeof useRouter> | null = null;
	try {
		// Hooks cannot be called conditionally, but Next's useRouter throws
		// AFTER the hook call — catching here keeps the tree mounted in tests
		// while remaining a plain hook call in production.
		router = useRouter();
	} catch {
		router = null;
	}
	return () => {
		try { router?.refresh(); } catch { /* no router: the parent re-reads */ }
	};
}

export function LanguageSettings({
	value,
	onChange,
}: {
	value: AppLocale;
	/** Persists the language. MUST resolve only after the record is on disk:
	 *  the refresh below re-reads it server-side, and firing the refresh
	 *  before the write lands sent the OLD locale back (switching to English
	 *  then back to Chinese appeared to do nothing until a manual reload). */
	onChange: (language: AppLocale) => void | Promise<unknown>;
}) {
	const t = useT("settingsGeneral");
	const refresh = useOptionalRefresh();
	const [pending, startTransition] = useTransition();

	return (
		<SettingsRow
			label={t("languageRow")}
			hint={t("languageRowHint")}
			testid="row-language"
		>
			<div role="radiogroup" aria-label={t("languageRow")} data-testid="language-picker" className="flex items-center gap-1">
				{LOCALES.map((locale) => {
					const active = locale === value;
					return (
						<button
							key={locale}
							type="button"
							role="radio"
							aria-checked={active}
							data-testid={`language-${locale}`}
							className={cn(
								"cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors",
								active
									? "border-foreground/25 bg-accent text-foreground"
									: "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								pending && "opacity-60",
							)}
							onClick={() => {
								if (active) return;
								// ORDER IS THE FIX: persist first, then refresh. The
								// refresh re-renders the server tree from the settings
								// record, so it must observe the NEW value.
								startTransition(async () => {
									try { await onChange(locale); } finally { refresh(); }
								});
							}}
						>
							{LOCALE_LABELS[locale]}
						</button>
					);
				})}
			</div>
		</SettingsRow>
	);
}
