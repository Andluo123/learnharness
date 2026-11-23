/**
 * SPEECH SYNTHESIS (TTS) — the server-side seam.
 *
 * The renderer never holds a TTS credential. It asks this module for
 * audio; this module resolves the provider, the credential and the voice,
 * normalizes the text for speaking, and calls the provider.
 *
 * TWO PROVIDERS, ONE SHAPE (owner decision 2026-11-20):
 *   - "deepgram" — Deepgram Flux TTS, using the SAME DEEPGRAM_API_KEY the
 *     dictation wave already uses. TTS introduces no second secret.
 *   - "custom"   — an OpenAI-compatible `{baseUrl}/audio/speech` endpoint
 *     that REUSES the custom MODEL endpoint's base URL and credential.
 *
 * The number expansion happens HERE, not in the renderer, because only this
 * side knows the VOICE — and the voice is the language. A Chinese voice
 * reads Chinese numerals even for an English passage, and the Chinese Flux
 * voices are Early Access: the provider does NOT normalize numbers for
 * them, so we have to (see src/core/speech-numbers.ts).
 */

import { keyValue } from "./keys.ts";
import { readSettings } from "../store/settings.ts";
import { customAuthState, customKeyAuthorized } from "./custom-provider-auth.ts";
import { normalizeBaseUrl } from "../core/settings.ts";
import {
	DEEPGRAM_FLUX_VOICES as DEEPGRAM_VOICES,
	EDGE_VOICES,
	DEEPGRAM_SPEECH_KEY_ID,
	clampSpeechSpeed,
	resolveSpeechConfig,
	speechVoiceLanguage,
	type SpeechAudioFormat,
	type SpeechConfig,
	type SpeechProviderId,
	type SpeechVoice,
} from "../core/speech.ts";
import { detectSpeechLocale, expandNumbersForSpeech, type SpeechNumberLocale } from "../core/speech-numbers.ts";
import { EdgeSynthesisError, synthesizeWithEdge } from "./edge-tts.ts";

/** The Deepgram Flux batch endpoint. Flux ONLY exists on /v2/speak — /v1/speak
 *  serves the older aura-* voices. */
const DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v2/speak";

/** The longest text one request may carry. The player chunks far below this
 *  (SPEECH_CHUNK_MAX_CHARS), so this is a backstop, not the working size. */
export const SPEECH_REQUEST_MAX_CHARS = 4000;

/** A synthesis failure with the HTTP status the route should answer with. */
export class SpeechSynthesisError extends Error {
	readonly status: number;
	constructor(message: string, status = 502) {
		super(message);
		this.name = "SpeechSynthesisError";
		this.status = status;
	}
}

/** One synthesis request: the text to speak, plus an optional voice
 *  override (a preview before the user saves the picker). */
export interface SpeechSynthesisRequest {
	text: string;
	/** Overrides the saved voice for this one request. */
	voice?: string;
}

export interface SpeechSynthesisResult {
	/** The encoded audio bytes. */
	audio: Uint8Array;
	/** The container the bytes are in. */
	contentType: string;
	provider: SpeechProviderId;
	/** The voice that actually spoke. */
	voice: string;
}

/** The audio container each provider speaks. */
function contentTypeFor(format: SpeechAudioFormat): string {
	if (format === "wav") return "audio/wav";
	if (format === "opus") return "audio/opus";
	return "audio/mpeg";
}

/** The reading locale for the numbers in this text.
 *
 *  "auto" (the default) follows the voice: a Chinese Flux voice reads
 *  Chinese numerals. A custom provider's voice says nothing about its
 *  language, so the text decides. */
function readingLocale(config: SpeechConfig, text: string): SpeechNumberLocale {
	if (config.language === "zh" || config.language === "en") return config.language;
	const voiceLanguage = config.provider === "deepgram" ? speechVoiceLanguage(config.voice) : undefined;
	if (voiceLanguage === "zh" || voiceLanguage === "en") return voiceLanguage;
	return detectSpeechLocale(text);
}

/** The credentials for the built-in provider. */
function deepgramKey(): string {
	const key = keyValue(DEEPGRAM_SPEECH_KEY_ID);
	if (!key) {
		throw new SpeechSynthesisError(
			"No DEEPGRAM_API_KEY — add it to auth.json (desktop) or .env.local (dev).",
			503,
		);
	}
	return key;
}

/** Speak with Deepgram Flux (batch REST). */
async function synthesizeWithDeepgram(
	text: string,
	config: SpeechConfig,
): Promise<{ audio: Uint8Array; contentType: string }> {
	const key = deepgramKey();
	const voice = config.voice;
	const params = new URLSearchParams({ model: voice, encoding: config.format });
	if (config.format === "wav") {
		// linear16 is raw PCM — it needs a container to be a playable file.
		params.set("encoding", "linear16");
		params.set("container", "wav");
		params.set("sample_rate", "24000");
	}
	if (config.speed !== 1) params.set("speed", String(config.speed));

	const res = await fetch(`${DEEPGRAM_SPEAK_URL}?${params.toString()}`, {
		method: "POST",
		headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
		body: JSON.stringify({ text }),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new SpeechSynthesisError(
			`Deepgram synthesis failed (${res.status}): ${detail.slice(0, 200)}`,
			res.status === 401 || res.status === 403 ? 502 : 502,
		);
	}
	const audio = new Uint8Array(await res.arrayBuffer());
	if (audio.byteLength === 0) throw new SpeechSynthesisError("Deepgram returned no audio", 502);
	return { audio, contentType: contentTypeFor(config.format) };
}

/** Speak with a custom OpenAI-compatible endpoint. It REUSES the custom
 *  MODEL endpoint's base URL and credential (owner decision 2026-11-20) —
 *  TTS never introduces a second secret. */
async function synthesizeWithCustom(
	text: string,
	config: SpeechConfig,
): Promise<{ audio: Uint8Array; contentType: string }> {
	const settings = readSettings();
	const cp = settings?.customProvider;
	const baseUrl = normalizeBaseUrl(cp?.baseUrl ?? "");
	if (!baseUrl) {
		throw new SpeechSynthesisError(
			"No custom endpoint — connect one in Settings → Agent → Model, or switch the speech provider.",
			400,
		);
	}
	const model = config.customModel.trim();
	if (!model) {
		throw new SpeechSynthesisError("No speech model — pick one in Settings → Speech.", 400);
	}

	// The credential comes from the same authorized binding the model
	// endpoint uses: a keyless server needs no header at all.
	let headers: Record<string, string> = { "Content-Type": "application/json" };
	if (cp?.authMode === "apiKey") {
		const state = customAuthState(true, cp);
		const key = customKeyAuthorized(cp, state) ? state.key : undefined;
		if (!key) {
			throw new SpeechSynthesisError(
				"The custom endpoint's key is not authorized for this base URL.",
				503,
			);
		}
		headers = { ...headers, Authorization: `Bearer ${key}` };
	}

	const res = await fetch(`${baseUrl}/audio/speech`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model,
			input: text,
			voice: config.customVoice.trim() || "alloy",
			response_format: config.format,
			speed: config.speed,
		}),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new SpeechSynthesisError(
			`Custom synthesis failed (${res.status}): ${detail.slice(0, 200)}`,
			502,
		);
	}
	const audio = new Uint8Array(await res.arrayBuffer());
	if (audio.byteLength === 0) throw new SpeechSynthesisError("The custom endpoint returned no audio", 502);
	const headerType = res.headers.get("content-type")?.split(";")[0]?.trim();
	return { audio, contentType: headerType || contentTypeFor(config.format) };
}

/** Speak with Microsoft Edge's Read Aloud service.
 *
 *  Edge normalizes numbers, dates and currency itself (measured: "2024年3月5日,
 *  价格1234.56元" is read correctly untouched), so this path SKIPS the number
 *  expansion the Deepgram Flux voices need — pre-expanding would replace
 *  "2024" with 「二零二四」 and lose Edge's own, better reading. */
async function synthesizeWithEdgeProvider(
	text: string,
	config: SpeechConfig,
): Promise<{ audio: Uint8Array; contentType: string }> {
	try {
		const audio = await synthesizeWithEdge({
			text,
			voice: config.voice,
			speed: config.speed,
			lang: config.language === "zh" ? "zh-CN" : config.language === "en" ? "en-US" : undefined,
		});
		return { audio, contentType: contentTypeFor(config.format) };
	} catch (error) {
		if (error instanceof EdgeSynthesisError) {
			throw new SpeechSynthesisError(
				`Edge speech failed: ${error.message} This is an unofficial Microsoft endpoint; try another speech provider in Settings → Speech.`,
				502,
			);
		}
		throw error;
	}
}

/** Synthesize one piece of text with the configured provider.
 *
 *  The text is normalized for speaking FIRST (numbers, dates, currency),
 *  because the Chinese Flux voices are Early Access and read "2024" as
 *  digits. */
export async function synthesizeSpeech(
	request: SpeechSynthesisRequest,
): Promise<SpeechSynthesisResult> {
	const text = request.text.trim();
	if (!text) throw new SpeechSynthesisError("Nothing to read", 400);
	if (text.length > SPEECH_REQUEST_MAX_CHARS) {
		throw new SpeechSynthesisError(
			`That passage is too long for one request (${text.length} characters; the limit is ${SPEECH_REQUEST_MAX_CHARS}).`,
			413,
		);
	}

	const settings = readSettings();
	const config = resolveSpeechConfig(settings?.speech);
	if (request.voice?.trim()) config.voice = request.voice.trim();
	config.speed = clampSpeechSpeed(config.speed);

	// Edge normalizes numbers itself; the Flux voices do not. Expanding for
	// Edge would make it read our transcription instead of the real thing.
	const spoken =
		config.provider === "edge" ? text : expandNumbersForSpeech(text, readingLocale(config, text));
	const result =
		config.provider === "edge"
			? await synthesizeWithEdgeProvider(spoken, config)
			: config.provider === "custom"
				? await synthesizeWithCustom(spoken, config)
				: await synthesizeWithDeepgram(spoken, config);

	return {
		audio: result.audio,
		contentType: result.contentType,
		provider: config.provider,
		voice: config.provider === "custom" ? config.customVoice : config.voice,
	};
}

/** The voices the picker offers.
 *
 *  The Deepgram and Edge catalogs are static and live in the core vocabulary
 *  (Edge's was measured against the live endpoint). A custom endpoint may
 *  publish its voices at {baseUrl}/audio/voices; when it does not, the picker
 *  stays a free-text field (the voice name is passed straight through to the
 *  endpoint). */
export async function speechVoices(): Promise<{
	deepgram: SpeechVoice[];
	edge: SpeechVoice[];
	custom: { id: string; name: string }[];
	customSupportsDiscovery: boolean;
}> {
	const settings = readSettings();
	const cp = settings?.customProvider;
	const baseUrl = normalizeBaseUrl(cp?.baseUrl ?? "");
	if (!baseUrl) {
		return { deepgram: [...DEEPGRAM_VOICES], edge: [...EDGE_VOICES], custom: [], customSupportsDiscovery: false };
	}
	try {
		const res = await fetch(`${baseUrl}/audio/voices`, {
			method: "GET",
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = (await res.json()) as unknown;
		const rows = Array.isArray(body)
			? body
			: Array.isArray((body as { data?: unknown[] })?.data)
				? (body as { data: unknown[] }).data
				: [];
		const voices: { id: string; name: string }[] = [];
		for (const row of rows) {
			if (typeof row === "string") { voices.push({ id: row, name: row }); continue; }
			const record = row as { id?: unknown; name?: unknown };
			const id = typeof record?.id === "string" ? record.id : "";
			if (!id) continue;
			voices.push({ id, name: typeof record?.name === "string" && record.name ? record.name : id });
		}
		return { deepgram: [...DEEPGRAM_VOICES], edge: [...EDGE_VOICES], custom: voices, customSupportsDiscovery: voices.length > 0 };
	} catch {
		return { deepgram: [...DEEPGRAM_VOICES], edge: [...EDGE_VOICES], custom: [], customSupportsDiscovery: false };
	}
}
