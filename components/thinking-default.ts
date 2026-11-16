"use client";

/**
 * The default-order resolution, CLIENT-SIDE (chunk 2, Platform interlude
 * bd68486): the UI mirrors defaultThinkingLevel from src/agent/models.ts
 * EXACTLY — first DEFAULT_THINKING_ORDER entry the model supports, else
 * the first supported level, else "off". One source of truth for the
 * ordering (the core barrel); this helper is its only client
 * interpretation, so a fresh model pick can auto-populate the SAME
 * level the engine would run for an unset record (owner ruling: the
 * ordering's ONLY purpose is first assignment — an explicit pick always
 * wins, and after a swap the WRITE clamps server-side, the signal
 * re-reads, and the clamped truth displays).
 */
import { DEFAULT_THINKING_ORDER } from "@/src/core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { useT } from "@/i18n/use-t.ts";

/** Display labels for the levels (shared by every trigger that shows
 *  one). Lowercase, always (owner refinement round, 2026-09-24): the
 *  level strings ARE the display form — the settings menus render them
 *  raw, so the composer pill and setup dialog must match, never Title
 *  Case. */
export const THINKING_LABEL: Record<string, string> = {
	off: "off",
	minimal: "minimal",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
	max: "max",
};

/** The display label for a level, translated when a translator is supplied
 *  (zh-CN i18n wave). The raw level strings stay the identity key
 *  everywhere — the record, the clamp, and the wire are never translated;
 *  only what the learner READS is.
 *
 *  IMPORTANT: the translator must be the ROOT one (useT() with no
 *  namespace) — the labels live under the top-level "thinking" namespace,
 *  so a section-scoped translator would render the key path instead
 *  ("modelPicker.thinking.medium"). useThinkingLabel() below is the
 *  safe way to obtain one. */
export function thinkingLabel(
	level: string,
	t?: (key: string) => string,
): string {
	if (!t) return THINKING_LABEL[level] ?? level;
	return t(`thinking.${level}`);
}

/** The hook form: a ROOT translator bound to the thinking namespace, safe
 *  to call from any component regardless of its own useT namespace. */
export function useThinkingLabel(): (level: string) => string {
	const t = useT();
	return (level: string) => thinkingLabel(level, t);
}

/** The level a fresh pick of `supported` populates with. Empty support
 *  (shouldn't happen — the catalog always reports at least ["off"])
 *  resolves "off", matching the server's fallback. */
export function defaultOrderLevel(supported: readonly ThinkingLevel[]): ThinkingLevel {
	for (const level of DEFAULT_THINKING_ORDER) {
		if (supported.includes(level)) return level;
	}
	return supported[0] ?? "off";
}

/** An EXPLICIT level always rides — even when the fresh pick's model
 *  doesn't support it: the WRITE clamps it to the nearest supported level
 *  server-side (Platform's interlude bd68486 — the owner's swap-400 case
 *  now just works), and the cross-surface signal re-reads so the clamped
 *  truth displays. The ordering only assigns FIRST: when no explicit
 *  level exists, a fresh model pick populates the ordering's level for
 *  that model (chunk 2: the unset state can never re-enter). */
export function populateLevel(
	explicit: ThinkingLevel | undefined,
	supported: readonly ThinkingLevel[],
): ThinkingLevel {
	return explicit ?? defaultOrderLevel(supported);
}