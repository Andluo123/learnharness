"use client";

import type { CacheRetention } from "@earendil-works/pi-ai";
import { useT } from "@/i18n/use-t.ts";

/** The four retention choices. `key` is the message id; the English copy
 *  lives in the catalog so tests and the UI read one source. */
const OPTIONS = [
	{ value: undefined, compact: "default", key: "optionDefault" },
	{ value: "none", compact: "not requested", key: "optionNone" },
	{ value: "short", compact: "short", key: "optionShort" },
	{ value: "long", compact: "long", key: "optionLong" },
] as const;

/** The trigger's one-line summary ("Cache: default" / "缓存：默认"). Pure —
 *  exported for the row that renders it outside this menu. */
export function cacheRetentionLabel(
	value: CacheRetention | undefined,
	t?: (key: string, values?: Record<string, unknown>) => string,
): string {
	const compact = OPTIONS.find((option) => option.value === value)!.compact;
	if (!t) return `Cache: ${compact}`;
	return t("compactSummary", { mode: t(`compact.${compact.replace(/\s+/g, "")}`) });
}

export function CacheRetentionMenu({ value, onPick }: {
	value: CacheRetention | undefined;
	onPick: (value: CacheRetention | undefined) => void;
}) {
	const t = useT("settingsCacheRetention");
	return <>
		<div className="border-b border-border px-2 pb-2">
			<p className="text-card-foreground">{t("cacheRetention")}</p>
			<p className="mt-1 text-muted-foreground">{t("intro")}</p>
		</div>
		{OPTIONS.map((option) => <button
			key={option.value ?? "default"}
			type="button"
			data-testid={`cache-retention-option-${option.value ?? "default"}`}
			aria-pressed={value === option.value}
			onClick={() => onPick(option.value)}
			className={`rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted ${value === option.value ? "bg-muted/60" : ""}`}
		>
			<span className="flex justify-between gap-2 text-card-foreground"><span>{t(`${option.key}Label`)}</span>{value === option.value && <span aria-hidden>✓</span>}</span>
			<span className="mt-1 block text-muted-foreground">{t(`${option.key}Description`)}</span>
		</button>)}
	</>;
}
