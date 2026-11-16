"use client";
/**
 * Localized document title (zh-CN i18n wave).
 *
 * generateMetadata() cannot reach next-intl's request config, so the
 * <title>/<meta description> are applied here on the client instead. The
 * static English metadata in app/layout.tsx remains the pre-hydration
 * value; this swaps it once the catalog is available. Cheap, idempotent,
 * and only touches the two document fields.
 */

import { useEffect } from "react";
import { useT } from "@/i18n/use-t.ts";

export function LocalizedTitle() {
	const t = useT("app");
	useEffect(() => {
		const title = t("title");
		const description = t("description");
		if (document.title !== title) document.title = title;
		let meta = document.querySelector('meta[name="description"]');
		if (!meta) {
			meta = document.createElement("meta");
			meta.setAttribute("name", "description");
			document.head.appendChild(meta);
		}
		if (description && meta.getAttribute("content") !== description) meta.setAttribute("content", description);
	}, [t]);
	return null;
}
