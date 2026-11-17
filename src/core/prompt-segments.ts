/**
 * The pure prompt-segment grammar (P2 reconciliation, 2026-09-19):
 * segment-path validation + the shared segment types, ZERO fs. Discovery
 * (reading the agent's prompt tree) lives in the agent layer
 * (src/agent/prompt-segments.ts — the canonical loader composeInstructions
 * composes through); the override-file CRUD lives in the store adapter
 * (src/store/prompt-overrides.ts). Both import THIS grammar so the
 * mirror-layout rules are defined exactly once.
 *
 * Path grammar: "system-prompt.md" (the shared base), "shared/<fragment>"
 * (sources v1: fragments composed by BOTH agents), "prober/<fragment>" /
 * "teacher/<fragment>" — where <fragment> is numeric-prefixed + .md
 * (e.g. 20-teaching.md). POSIX-relative, no traversal, no nesting.
 */

/** A prompt fragment: numeric order key + .md (e.g. 20-teaching.md). Nothing else loads.
 *
 *  TRANSLATIONS ARE SIBLINGS (zh-CN wave): `20-teaching.zh-CN.md` is the
 *  Chinese rendering of `20-teaching.md`. The pattern deliberately EXCLUDES
 *  a language suffix so a translated file never registers as its own
 *  segment — discovery keeps one entry per logical fragment and picks the
 *  text by language. */
export const FRAGMENT_RE = /^\d+-[\w-]+\.md$/;

/** The language suffix a translated fragment carries (before .md). */
export const LOCALE_SUFFIX = ".zh-CN.md";

/** The translated sibling of a source fragment path, or null when the
 *  basename is not a fragment (system-prompt.md has its own fixed name).
 *  Pure string work — this module stays importable without node:path. */
export function translatedFragmentPath(file: string): string | null {
	const slash = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
	const base = slash >= 0 ? file.slice(slash + 1) : file;
	if (!FRAGMENT_RE.test(base)) return null;
	return file.replace(/\.md$/, LOCALE_SUFFIX);
}

/** The fixed translated sibling of the shared base prompt. */
export const TRANSLATED_BASE = "system-prompt.zh-CN.md";

/** Which agent's prompt directory to compose. */
/** Practice (2026-10-04): composes ONLY its own directory — no shared
 *  teaching base, no shared fragments (the doctrine contradicts the
 *  teaching philosophy; its 00-base.md plays the base role). */
export type PromptAgent = "prober" | "teacher" | "practice";

/** One segment of one agent's composed prompt. */
export interface PromptSegmentInfo {
	/** The override/store key — mirrors the source layout ("system-prompt.md",
	 *  "shared/05-learner-files.md", "teacher/20-teaching.md"). Stable across
	 *  agents: the base and shared/ fragments use the SAME path in both
	 *  agents' lists. */
	path: string;
	/** The source text (what the segment runs without an override). */
	sourceText: string;
	/** The user's override text, or null when no file exists on disk. */
	overrideText: string | null;
	/** Effective state: the settings switch AND the file both present. */
	enabled: boolean;
	/** True for segments BOTH agents compose — the base and shared/ fragments. */
	shared: boolean;
}

/** Validate a segment path against the mirror-layout rules (see module
 *  doc). Exported for the routes, which also check membership in the
 *  CURRENT source segment list. */
export function isValidSegmentPath(segmentPath: string): boolean {
	if (segmentPath === "system-prompt.md") return true;
	const m = /^(prober|teacher|practice|shared)\/([\w.-]+\.md)$/.exec(segmentPath);
	if (!m || m[2] === undefined) return false;
	return FRAGMENT_RE.test(m[2]);
}
