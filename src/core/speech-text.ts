/**
 * SPEECH TEXT (TTS, 2026-11-20) — Markdown → speakable prose.
 *
 * The learner asked to HEAR the lesson, not to hear its source. So this
 * module strips the parts that do not belong in speech: code blocks (by
 * default), formulas, images, link targets, table pipes, and markdown
 * punctuation — and keeps the prose that does.
 *
 * It reuses the app's own content reader (src/core/content-reader.ts), the
 * same one the renderer uses, so "what is code" means the SAME thing here
 * as it does on screen. No second grammar.
 */
import { readContentSpans } from "./content-reader.ts";
import { speakMath, speakMathOperators, type SpeechMathLocale } from "./speech-math.ts";

/** What the text layer should keep. */
export interface SpeechTextOptions {
	/** Read fenced/indented code blocks aloud too. Off by default — a lesson's
	 *  code is easier read than spoken. */
	readCode?: boolean;
	/** How to speak a formula: "skip" says nothing, "label" reads "公式",
	 *  "read" speaks the formula itself (LaTeX → words). */
	math?: "skip" | "label" | "read";
	/** The language a formula is read in. Only used when math is "read". */
	mathLocale?: SpeechMathLocale;
	/**
	 * Say lone Latin letters as Chinese syllables ("x" → 「艾克斯」) instead of
	 * passing the letter through.
	 *
	 * This exists because the Deepgram Flux Mandarin voices are Early Access
	 * and mispronounce a lone letter (measured: "b等于一" reads as "b=").
	 * Microsoft Edge reads the same letter correctly, so it is switched OFF
	 * there — an Edge voice saying a real "x" beats a phonetic stand-in.
	 * Absent = true, the behaviour every existing caller already has.
	 */
	letterNames?: boolean;
}

const DEFAULT_OPTIONS: Required<SpeechTextOptions> = { readCode: false, math: "skip", mathLocale: "zh", letterNames: true };

/** Markdown punctuation that has no spoken form. */
const HEADING_MARK = /^[ \t]{0,3}#{1,6}[ \t]+/gm;
const BLOCKQUOTE_MARK = /^[ \t]{0,3}>[ \t]?/gm;
const LIST_MARK = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+/gm;
const EMPHASIS_MARK = /(\*{1,3}|_{1,3})(?=\S)([\s\S]*?\S)\1/g;
const STRIKE_MARK = /~~([\s\S]*?)~~/g;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const AUTOLINK = /<((?:https?|mailto):[^>]+)>/g;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const TABLE_ROW = /^\s*\|.*\|\s*$/gm;
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/gm;
const FOOTNOTE_DEF = /^\[\^[^\]]+\]:.*$/gm;
const FOOTNOTE_REF = /\[\^[^\]]+\]/g;
const HORIZONTAL_RULE = /^[ \t]{0,3}(?:\*\s*){3,}$|^[ \t]{0,3}(?:-\s*){3,}$|^[ \t]{0,3}(?:_\s*){3,}$/gm;
const TASK_MARK = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]*/gm;

/** Strip one markdown table row down to its cell texts, joined by a comma
 *  — a table read as a list of values, not as pipe characters. */
function readTableRow(row: string): string {
	return row
		.replace(/^\s*\|/, "")
		.replace(/\|\s*$/, "")
		.split("|")
		.map((cell) => cell.trim())
		.filter((cell) => cell.length > 0)
		.join(", ");
}

/** Remove the markdown decoration from a prose span. The order matters:
 *  images and links before emphasis, so their inner text survives. */
function readProse(raw: string, math: "skip" | "label" | "read", locale: SpeechMathLocale, letterNames: boolean): string {
	let out = raw;
	out = out.replace(TABLE_DIVIDER, "");
	out = out.replace(TABLE_ROW, (row) => readTableRow(row));
	out = out.replace(FOOTNOTE_DEF, "");
	out = out.replace(IMAGE, (_m, alt: string) => (alt.trim() ? alt.trim() + "。" : ""));
	out = out.replace(LINK, (_m, label: string) => label);
	out = out.replace(AUTOLINK, (_m, url: string) => url);
	out = out.replace(HTML_TAG, "");
	out = out.replace(FOOTNOTE_REF, "");
	out = out.replace(HEADING_MARK, "");
	out = out.replace(BLOCKQUOTE_MARK, "");
	out = out.replace(TASK_MARK, "");
	out = out.replace(LIST_MARK, "");
	out = out.replace(STRIKE_MARK, "$1");
	out = out.replace(EMPHASIS_MARK, "$2");
	out = out.replace(HORIZONTAL_RULE, "");
	if (math === "label") out = out.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*?\$/g, "公式");
	// A formula written WITHOUT delimiters is plain prose to the reader, so
	// its operators would reach the voice as raw symbols ("y = 2x"). Speak
	// the ones that have a name.
	if (math === "read") {
		out = speakMathOperators(out, locale)
			// The pass pads its words; collapse that padding so sentence
			// splitting and chunking see ordinary prose.
			.replace(/[ \t]{2,}/g, " ")
			.replace(/ +(\uFF0C|\u3002|\uFF1B|\uFF1A|\uFF09|,|\.)/g, "$1")
			.trim();
	}
	return out;
}

/** One speakable piece of a document. */
export interface SpeechSegment {
	/** The text to speak. */
	text: string;
	/** Why this segment exists — used by the tests and by the player's
	 *  "skipped" reporting. */
	kind: "prose" | "code" | "math";
}

/** Split a Markdown document into the pieces worth speaking.
 *
 *  Code and math are SEPARATE segments (not silently dropped) so the
 *  caller can decide: skip them, or read them. Nothing is lost. */
export function speechSegments(markdown: string, options: SpeechTextOptions = {}): SpeechSegment[] {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const segments: SpeechSegment[] = [];
	for (const span of readContentSpans(markdown)) {
		if (span.kind === "code") {
			if (!opts.readCode) continue;
			const body = span.raw.replace(/^\s*(?:```|~~~)[^\n]*\n?/, "").replace(/\n?\s*(?:```|~~~)\s*$/, "");
			if (body.trim()) segments.push({ text: body.trim(), kind: "code" });
			continue;
		}
		if (span.kind === "math") {
			if (opts.math === "label") {
				segments.push({ text: "公式", kind: "math" });
				continue;
			}
			if (opts.math === "read") {
				const spoken = speakMath(span.body, opts.mathLocale, opts.letterNames);
				if (spoken) segments.push({ text: spoken, kind: "math" });
			}
			continue;
		}
		const text = readProse(span.raw, opts.math, opts.mathLocale, opts.letterNames).trim();
		if (text) segments.push({ text, kind: "prose" });
	}
	return segments;
}

/** The whole document as one speakable string — the segments joined with a
 *  space, so a paragraph boundary is a breath, not a run-on. */
export function speechText(markdown: string, options: SpeechTextOptions = {}): string {
	return speechSegments(markdown, options).map((segment) => segment.text).join(" ");
}

/** The sentence boundaries used by the chunker.
 *
 *  Chinese sentences end without a space (。！？), so they split on the
 *  terminator alone. English sentences need whitespace or the end of the
 *  text after the mark — otherwise "3.14" or "Dr. Smith" would be cut in
 *  half. The punctuation stays with its sentence. */
const CJK_SENTENCE_END = /[。！？；…]+/g;
const EN_SENTENCE_END = /[.!?]+(?=\s|$)/g;

/** Split one paragraph into sentences. A sentence that is still too long is
 *  left whole — the chunker splits it further at a word boundary. */
export function speechSentences(text: string): string[] {
	const boundaries: number[] = [];
	for (const match of text.matchAll(CJK_SENTENCE_END)) {
		boundaries.push(match.index! + match[0].length);
	}
	for (const match of text.matchAll(EN_SENTENCE_END)) {
		const end = match.index! + match[0].length;
		// An English mark right after a CJK mark already closed a sentence.
		if (boundaries.some((at) => at >= match.index! && at <= end)) continue;
		boundaries.push(end);
	}
	boundaries.sort((a, b) => a - b);

	const out: string[] = [];
	let last = 0;
	for (const end of boundaries) {
		if (end <= last) continue;
		const piece = text.slice(last, end).trim();
		if (piece) out.push(piece);
		last = end;
	}
	const tail = text.slice(last).trim();
	if (tail) out.push(tail);
	return out;
}

/** Break an over-long piece at the last space (or comma) that fits, so a
 *  word is never cut in half. CJK text has no spaces — it is split at a
 *  character boundary instead. */
function splitLong(text: string, max: number): string[] {
	if (text.length <= max) return [text];
	const out: string[] = [];
	let rest = text;
	while (rest.length > max) {
		let cut = rest.lastIndexOf(" ", max);
		if (cut < max * 0.5) cut = rest.lastIndexOf(",", max);
		if (cut < max * 0.5) cut = rest.lastIndexOf("，", max);
		if (cut < max * 0.5) {
			// No usable break: a CJK run (or one very long token). Cut at the
			// character boundary — a CJK character never splits visually.
			out.push(rest.slice(0, max));
			rest = rest.slice(max);
			continue;
		}
		out.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut + 1);
	}
	if (rest.trim()) out.push(rest.trim());
	return out;
}

/** Split the speakable text into request-sized chunks.
 *
 *  A chunk is at most `max` characters, and is cut at a sentence boundary
 *  wherever possible. The result is what the server sends request by
 *  request — one chunk, one synthesis call, one audio file. */
export function speechChunks(markdown: string, max: number, options: SpeechTextOptions = {}): string[] {
	const limit = Math.max(1, Math.floor(max));
	// Sentences are the unit, not segments: a paragraph that mixes prose and a
	// formula is ONE thing to say ("提取 a 等于负三分之二："), and splitting it
	// per segment made the voice say each fragment as its own utterance — a
	// lone "提取" or "：" has no prosody of its own.
	const sentences: string[] = [];
	for (const segment of speechSegments(markdown, options)) {
		for (const sentence of speechSentences(segment.text)) {
			sentences.push(sentence);
		}
	}
	// Glue a fragment to its neighbour while it still fits: a trailing
	// punctuation-only fragment belongs to the sentence before it.
	const joined: string[] = [];
	for (const sentence of sentences) {
		const previous = joined.length > 0 ? joined[joined.length - 1]! : null;
		if (previous !== null && !SENTENCE_END.test(previous)) {
			const merged = `${previous}${JOIN_GAP}${sentence}`;
			if (merged.length <= limit) {
				joined[joined.length - 1] = merged;
				continue;
			}
		}
		joined.push(sentence);
	}

	const chunks: string[] = [];
	for (const sentence of joined) {
		const clean = sentence.replace(/[ \t]{2,}/g, " ").replace(/ +([\uFF0C\u3002\uFF1B\uFF1A\uFF09,.;:])/g, "$1").trim();
		for (const piece of splitLong(clean, limit)) {
			if (piece.trim()) chunks.push(piece.trim());
		}
	}
	return chunks;
}

/** The characters that close a sentence in either shipped language. */
const SENTENCE_END = /[。！？；….!?;:]\s*$/;

/** How the join separates two fragments of ONE sentence inside a request.
 *  A space, not a comma: the boundary came from a prose/math segment split,
 *  not from the author's punctuation. */
const JOIN_GAP = " ";
