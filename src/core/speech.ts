/**
 * SPEECH (TTS) — the provider vocabulary shared by the shell and the server.
 *
 * Two providers, ONE shape: Deepgram Flux (its own DEEPGRAM_API_KEY) and a
 * custom OpenAI-compatible endpoint that REUSES the custom MODEL endpoint's
 * baseUrl + credential (owner decision 2026-11-20) — TTS never introduces a
 * second secret.
 *
 * Pure, browser-safe: no keys, no network, no node builtins.
 */

/** The TTS provider. "custom" reuses the custom MODEL endpoint's baseUrl and
 *  credential; "deepgram" uses the app's existing Deepgram key; "edge" is
 *  Microsoft Edge's Read Aloud service, reached over its own WebSocket.
 *
 *  "edge" is UNOFFICIAL: Microsoft publishes no contract for it and offers no
 *  support. It needs no credential, which is exactly why it is not the
 *  default — see docs/speech.md. */
export type SpeechProviderId = "deepgram" | "custom" | "edge";

/** Which language the chosen voice should speak. "auto" follows the voice
 *  (a Chinese voice speaks Chinese; an English voice speaks English). */
export type SpeechLanguageStrategy = "auto" | "zh" | "en";

/** The audio container the server returns. */
export type SpeechAudioFormat = "mp3" | "wav" | "opus";

export interface SpeechVoice {
	/** The provider model id, e.g. "flux-wenjing-zh". */
	id: string;
	/** The display name shown in the picker. */
	name: string;
	/** The language family: "zh" | "en" | ... */
	language: string;
	/** The accent locale, e.g. "zh-CN" | "en-US". */
	locale: string;
	gender: "female" | "male";
}

/** The Deepgram Flux voice catalog.
 *
 *  Read from the official voices reference (2026-11-20). Flux model ids are
 *  `flux-{voice}-{language}`; the Chinese set is Early Access, which means
 *  the server does NOT normalize numbers for it — see speech-numbers.ts.
 *
 *  Only the two languages this app ships UI in (zh-CN, en) are listed; the
 *  custom provider accepts any voice string the user's server offers. */
export const DEEPGRAM_FLUX_VOICES: readonly SpeechVoice[] = [
	// Chinese (Mandarin) — Early Access.
	{ id: "flux-bo-zh", name: "Bo", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "flux-haoran-zh", name: "Haoran", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "flux-jian-zh", name: "Jian", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "flux-jie-zh", name: "Jie", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "flux-lijuan-zh", name: "Lijuan", language: "zh", locale: "zh-CN", gender: "female" },
	{ id: "flux-shufen-zh", name: "Shufen", language: "zh", locale: "zh-CN", gender: "female" },
	{ id: "flux-wenbo-zh", name: "Wenbo", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "flux-wenjing-zh", name: "Wenjing", language: "zh", locale: "zh-CN", gender: "female" },
	{ id: "flux-zhen-zh", name: "Zhen", language: "zh", locale: "zh-CN", gender: "female" },
	// Chinese (Taiwanese Mandarin) — Early Access.
	{ id: "flux-chiaying-zh", name: "Chiaying", language: "zh", locale: "zh-TW", gender: "female" },
	{ id: "flux-kuanyu-zh", name: "Kuanyu", language: "zh", locale: "zh-TW", gender: "male" },
	{ id: "flux-yawen-zh", name: "Yawen", language: "zh", locale: "zh-TW", gender: "female" },
	{ id: "flux-yuting-zh", name: "Yuting", language: "zh", locale: "zh-TW", gender: "female" },
	// Chinese (Cantonese) — Early Access.
	{ id: "flux-manlok-zh", name: "Manlok", language: "zh", locale: "zh-HK", gender: "male" },
	// English.
	{ id: "flux-hannah-en", name: "Hannah", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-kit-en", name: "Kit", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-alexis-en", name: "Alexis", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-cliff-en", name: "Cliff", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-sienna-en", name: "Sienna", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-cole-en", name: "Cole", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-brooke-en", name: "Brooke", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-colin-en", name: "Colin", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-gemma-en", name: "Gemma", language: "en", locale: "en-GB", gender: "female" },
	{ id: "flux-haley-en", name: "Haley", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-heather-en", name: "Heather", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-miles-en", name: "Miles", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-sean-en", name: "Sean", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-bree-en", name: "Bree", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-brittany-en", name: "Brittany", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-bruce-en", name: "Bruce", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-conor-en", name: "Conor", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-donovan-en", name: "Donovan", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-drew-en", name: "Drew", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-elise-en", name: "Elise", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-jack-en", name: "Jack", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-kai-en", name: "Kai", language: "en", locale: "en-SG", gender: "male" },
	{ id: "flux-kelsey-en", name: "Kelsey", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-maeve-en", name: "Maeve", language: "en", locale: "en-IE", gender: "female" },
	{ id: "flux-marcelo-en", name: "Marcelo", language: "en", locale: "en-PH", gender: "male" },
	{ id: "flux-marcus-en", name: "Marcus", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-meena-en", name: "Meena", language: "en", locale: "en-IN", gender: "female" },
	{ id: "flux-meghan-en", name: "Meghan", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-naveen-en", name: "Naveen", language: "en", locale: "en-IN", gender: "male" },
	{ id: "flux-paige-en", name: "Paige", language: "en", locale: "en-US", gender: "female" },
	{ id: "flux-priya-en", name: "Priya", language: "en", locale: "en-IN", gender: "female" },
	{ id: "flux-rufus-en", name: "Rufus", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-sharon-en", name: "Sharon", language: "en", locale: "en-AU", gender: "female" },
	{ id: "flux-tanner-en", name: "Tanner", language: "en", locale: "en-GB", gender: "male" },
	{ id: "flux-wade-en", name: "Wade", language: "en", locale: "en-US", gender: "male" },
	{ id: "flux-wes-en", name: "Wes", language: "en", locale: "en-US", gender: "male" },
];

/** The default voice: a Mandarin voice that reads the app's default UI
 *  language (zh-CN) correctly out of the box. */
export const DEFAULT_SPEECH_VOICE = "flux-wenjing-zh";

/** The Microsoft Edge Read Aloud voice catalog (measured 2026-11-21 against the
 *  live /voices/list endpoint: 318 voices total).
 *
 *  The list below is the curated slice this app ships UI for: Mandarin
 *  (zh-CN), Taiwanese Mandarin (zh-TW), Cantonese (zh-HK), US and UK English.
 *  The endpoint publishes dozens more languages; adding one is a data change
 *  here, not a code change.
 *
 *  NOTE: these ids are the SAME ids Azure Speech uses — "zh-CN-XiaoxiaoNeural"
 *  names the same voice on both services. That is why an Azure provider can
 *  later reuse this whole table. */
export const EDGE_VOICES: readonly SpeechVoice[] = [
	// Mandarin (zh-CN).
	{ id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", language: "zh", locale: "zh-CN", gender: "female" },
	{ id: "zh-CN-XiaoyiNeural", name: "Xiaoyi", language: "zh", locale: "zh-CN", gender: "female" },
	{ id: "zh-CN-YunjianNeural", name: "Yunjian", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunxiNeural", name: "Yunxi", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunxiaNeural", name: "Yunxia", language: "zh", locale: "zh-CN", gender: "male" },
	{ id: "zh-CN-YunyangNeural", name: "Yunyang", language: "zh", locale: "zh-CN", gender: "male" },
	// Taiwanese Mandarin (zh-TW).
	{ id: "zh-TW-HsiaoChenNeural", name: "HsiaoChen", language: "zh", locale: "zh-TW", gender: "female" },
	{ id: "zh-TW-HsiaoYuNeural", name: "HsiaoYu", language: "zh", locale: "zh-TW", gender: "female" },
	{ id: "zh-TW-YunJheNeural", name: "YunJhe", language: "zh", locale: "zh-TW", gender: "male" },
	// Cantonese (zh-HK).
	{ id: "zh-HK-HiuGaaiNeural", name: "HiuGaai", language: "zh", locale: "zh-HK", gender: "female" },
	{ id: "zh-HK-HiuMaanNeural", name: "HiuMaan", language: "zh", locale: "zh-HK", gender: "female" },
	{ id: "zh-HK-WanLungNeural", name: "WanLung", language: "zh", locale: "zh-HK", gender: "male" },
	// English (US).
	{ id: "en-US-AvaNeural", name: "Ava", language: "en", locale: "en-US", gender: "female" },
	{ id: "en-US-AndrewNeural", name: "Andrew", language: "en", locale: "en-US", gender: "male" },
	{ id: "en-US-EmmaNeural", name: "Emma", language: "en", locale: "en-US", gender: "female" },
	{ id: "en-US-BrianNeural", name: "Brian", language: "en", locale: "en-US", gender: "male" },
	{ id: "en-US-AriaNeural", name: "Aria", language: "en", locale: "en-US", gender: "female" },
	{ id: "en-US-JennyNeural", name: "Jenny", language: "en", locale: "en-US", gender: "female" },
	{ id: "en-US-GuyNeural", name: "Guy", language: "en", locale: "en-US", gender: "male" },
	{ id: "en-US-AvaMultilingualNeural", name: "Ava Multilingual", language: "en", locale: "en-US", gender: "female" },
	{ id: "en-US-AndrewMultilingualNeural", name: "Andrew Multilingual", language: "en", locale: "en-US", gender: "male" },
	{ id: "en-US-EmmaMultilingualNeural", name: "Emma Multilingual", language: "en", locale: "en-US", gender: "female" },
	// English (UK).
	{ id: "en-GB-SoniaNeural", name: "Sonia", language: "en", locale: "en-GB", gender: "female" },
	{ id: "en-GB-RyanNeural", name: "Ryan", language: "en", locale: "en-GB", gender: "male" },
	{ id: "en-GB-LibbyNeural", name: "Libby", language: "en", locale: "en-GB", gender: "female" },
	{ id: "en-GB-ThomasNeural", name: "Thomas", language: "en", locale: "en-GB", gender: "male" },
];

/** The default Edge voice: the Mandarin voice Microsoft ships as the Read
 *  Aloud default, and the one this app's own UI language is written in. */
export const DEFAULT_EDGE_VOICE = "zh-CN-XiaoxiaoNeural";

/** Which voice catalog belongs to a provider. "custom" has no catalog: its
 *  voices are free text, because the endpoint names them. */
export function speechVoiceCatalog(provider: SpeechProviderId): readonly SpeechVoice[] {
	if (provider === "edge") return EDGE_VOICES;
	if (provider === "deepgram") return DEEPGRAM_FLUX_VOICES;
	return [];
}

/** The default voice for a provider. */
export function defaultSpeechVoice(provider: SpeechProviderId): string {
	return provider === "edge" ? DEFAULT_EDGE_VOICE : DEFAULT_SPEECH_VOICE;
}


export const SPEECH_PROVIDER_IDS: readonly SpeechProviderId[] = ["deepgram", "custom", "edge"];

export function isSpeechProviderId(value: unknown): value is SpeechProviderId {
	return typeof value === "string" && (SPEECH_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isSpeechLanguageStrategy(value: unknown): value is SpeechLanguageStrategy {
	return value === "auto" || value === "zh" || value === "en";
}

export function isSpeechAudioFormat(value: unknown): value is SpeechAudioFormat {
	return value === "mp3" || value === "wav" || value === "opus";
}

/** The Deepgram key — the SAME key the STT wave already uses. TTS adds no
 *  new secret for the built-in provider. */
export const DEEPGRAM_SPEECH_KEY_ID = "DEEPGRAM_API_KEY";

/** The provider a fresh install starts on (owner decision 2026-11-21).
 *
 *  Edge is the default because it reads formulas better than the Flux
 *  Mandarin voices (which are Early Access and misread both numbers and lone
 *  Latin letters) and it needs no credential. Deepgram stays the explicit
 *  alternative — see docs/speech.md for the unofficial-endpoint disclosure
 *  that ships with this choice. */
export const DEFAULT_SPEECH_PROVIDER: SpeechProviderId = "edge";

/** Flux speed bounds (the API's own range: 0.5–1.5, step 0.05). */
export const SPEECH_SPEED_MIN = 0.5;
export const SPEECH_SPEED_MAX = 1.5;
export const SPEECH_SPEED_DEFAULT = 1;

export function clampSpeechSpeed(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return SPEECH_SPEED_DEFAULT;
	return Math.min(SPEECH_SPEED_MAX, Math.max(SPEECH_SPEED_MIN, Math.round(n * 100) / 100));
}

/** The conservative per-request character cap. Flux has no published hard
 *  limit we verified, so the chunker stays small: a long lesson is split
 *  into sentence-sized pieces rather than one giant request. */
export const SPEECH_CHUNK_MAX_CHARS = 200;

/** The app's speech preferences — one record, shared by every surface. */
export interface SpeechSettings {
	/** Which provider synthesizes. Absent = DEFAULT_SPEECH_PROVIDER ("edge"). */
	provider?: SpeechProviderId;
	/** The Deepgram Flux model id (see DEEPGRAM_FLUX_VOICES). */
	voice?: string;
	/** Speaking rate. Absent = 1. */
	speed?: number;
	/** The language strategy. Absent = "auto" (follow the voice). */
	language?: SpeechLanguageStrategy;
	/** Continuous mode: read each new assistant answer automatically. */
	autoRead?: boolean;
	/** Read code blocks aloud too. Absent = false (the default skips them). */
	readCode?: boolean;
	/** Read formulas aloud (LaTeX → words). Absent = true — a lesson's formula
	 *  is usually the point of the lesson. */
	readMath?: boolean;
	/** The custom endpoint's model id (provider "custom"). */
	customModel?: string;
	/** The custom endpoint's voice name (provider "custom"). */
	customVoice?: string;
	/** The audio container to request. Absent = "mp3". */
	format?: SpeechAudioFormat;
}

/** The resolved view the player and the server act on. */
export interface SpeechConfig {
	provider: SpeechProviderId;
	voice: string;
	speed: number;
	language: SpeechLanguageStrategy;
	autoRead: boolean;
	readCode: boolean;
	readMath: boolean;
	customModel: string;
	customVoice: string;
	format: SpeechAudioFormat;
}

/** Resolve the stored settings into the shape the runtime uses. */
export function resolveSpeechConfig(settings: SpeechSettings | undefined): SpeechConfig {
	const provider = isSpeechProviderId(settings?.provider) ? settings.provider : DEFAULT_SPEECH_PROVIDER;
	const voice = typeof settings?.voice === "string" && settings.voice ? settings.voice : defaultSpeechVoice(provider);
	return {
		provider,
		voice,
		speed: clampSpeechSpeed(settings?.speed),
		language: isSpeechLanguageStrategy(settings?.language) ? settings.language : "auto",
		autoRead: settings?.autoRead === true,
		readCode: settings?.readCode === true,
		readMath: settings?.readMath !== false,
		customModel: typeof settings?.customModel === "string" ? settings.customModel : "",
		customVoice: typeof settings?.customVoice === "string" ? settings.customVoice : "",
		format: isSpeechAudioFormat(settings?.format) ? settings.format : "mp3",
	};
}

/** The voice's language, looked up across every catalog. Unknown ids (a
 *  custom provider's voice) return undefined and the caller falls back to the
 *  language strategy, and finally to "zh" — the app's default UI language. */
export function speechVoiceLanguage(voice: string, provider?: SpeechProviderId): string | undefined {
	const catalog = provider ? speechVoiceCatalog(provider) : [...DEEPGRAM_FLUX_VOICES, ...EDGE_VOICES];
	return catalog.find((v) => v.id === voice)?.language;
}
