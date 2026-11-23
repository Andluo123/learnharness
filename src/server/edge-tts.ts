/**
 * EDGE TTS — the Microsoft Edge Read Aloud transport (speech wave, 2026-11-21).
 *
 * WHY THIS FILE EXISTS
 * Edge's Read Aloud service speaks the same neural voices Azure Speech sells,
 * needs no credential, and normalizes numbers/dates itself. It is reachable
 * over one WebSocket, so the whole client is ~200 lines with ZERO new
 * dependencies (it uses the `undici` WebSocket this repo already ships).
 *
 * IT IS UNOFFICIAL. Microsoft publishes no contract for this endpoint, offers
 * no support, and has changed its handshake before (the v1 token stopped
 * working and took every off-the-shelf client with it). Everything protocol-
 * specific is therefore confined to THIS FILE: when it breaks again, this is
 * the only file that changes. See docs/speech.md for the full disclosure.
 *
 * THE HANDSHAKE
 * The URL carries a `Sec-MS-GEC` token derived from the current time:
 *
 *     ticks  = (unixSeconds + 11644473600) rounded DOWN to a 300s boundary
 *     input  = "<EDGE_COPYRIGHT><ticks * 10^7><TRUSTED_CLIENT_TOKEN>"
 *     token  = "<CS64(input)>-<SHA256(input)>"
 *
 * `Sec-MS-GEC-Version` must be `2-<chromium version>`; the v1 form (a bare
 * SHA-256 of ticks+token, version prefix "1-") is rejected with 403 today.
 * Because the token is time-derived, a machine whose clock is more than one
 * window out of step is refused — so a 403 is retried ONCE after correcting
 * the skew from the server's own `Date` response header.
 *
 * ATTRIBUTION: the protocol behaviour here was worked out from
 * msedge-tts (MIT, (c) 2023 Migushthe2nd) and rany2/edge-tts (LGPLv3); no
 * source code from either project is copied. EDGE_COPYRIGHT below is
 * Microsoft's own copyright line and is a REQUIRED part of the hash input —
 * it is data this protocol demands, not a claim of ours.
 */
import { createHash, randomUUID } from "node:crypto";
import { WebSocket } from "undici";

/** The shared client token Edge's Read Aloud uses in every request. */
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

/** Microsoft's copyright line. A REQUIRED part of the v2 token input. */
const EDGE_COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";

/** The Edge build whose handshake we reproduce. The service checks the major
 *  version in `Sec-MS-GEC-Version`; keep this close to a current Edge. */
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0]!;

/** The browser identity the service expects. It refuses an unfamiliar client. */
const USER_AGENT =
	`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;

const WSS_BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

/** The audio container Edge streams by default: 24 kHz mono MP3 at 48 kbps. */
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

/** Windows FILETIME epoch offset: seconds between 1601-01-01 and 1970-01-01. */
const WIN_EPOCH = 11644473600;

/** The token's time window: the service only accepts a token minted within
 *  the current 300-second slot. */
const TOKEN_WINDOW_SECONDS = 300;

/** How long one synthesis may take before we give up. A short passage
 *  answers in ~1.5s; the ceiling is generous for a long one. */
const SYNTHESIS_TIMEOUT_MS = 25_000;

// --- The v2 token ---------------------------------------------------------
//
// The CS64 mixer is an obfuscated checksum over the message (Microsoft's
// copyright line + the tick string). Its constants are fixed protocol values.

const SWAP_FIRST_WORD = { word: 0xef0569fb, sum: 0x76f50f34, product: 0xc3efea97 };
const SWAP_SECOND_WORD = { word: 0xc31713db, sum: 0x1881ce3c, product: 0x35bd1ec9 };
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

/** Rotate a 32-bit word's halves. */
function swapHalves(value: number): number {
	return ((value << 16) | (value >>> 16)) >>> 0;
}

function swapTerm(word: number, key: number, multipliers: { word: number; sum: number; product: number }): number {
	const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.word);
	const product = Math.imul(swapHalves(sum), multipliers.sum) >>> 0;
	return (Math.imul(swapHalves(product), multipliers.product) + product) >>> 0;
}

function swapAndMultiply(value: number, multipliers: readonly number[]): number {
	let out = value;
	for (const multiplier of multipliers) out = Math.imul(swapHalves(out), multiplier) >>> 0;
	return out;
}

/** The CS64 checksum: 8 bytes, derived from the message and its SHA-256. */
function cs64(message: Uint8Array, digest: Uint8Array): Uint8Array {
	const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
	const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
	const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
	// The message is read as little-endian 32-bit word PAIRS, zero padded.
	const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
	padded.set(message);
	const words = new DataView(padded.buffer);
	let swapSum = 0;
	let lastSwap = 0;
	let mix = 0;
	let mixSum = 0;
	for (let offset = 0; offset < padded.length; offset += 8) {
		const firstWord = words.getUint32(offset, true);
		const secondWord = words.getUint32(offset + 4, true);
		const firstSwap = swapTerm(firstWord, firstKey, SWAP_FIRST_WORD);
		lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
		swapSum = (swapSum + firstSwap + lastSwap) >>> 0;
		mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
		mixSum = (mixSum + mix) >>> 0;
		mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
		mixSum = (mixSum + mix) >>> 0;
	}
	const checksum = new Uint8Array(8);
	const checksumView = new DataView(checksum.buffer);
	checksumView.setUint32(0, lastSwap ^ mix, true);
	checksumView.setUint32(4, swapSum ^ mixSum, true);
	return checksum;
}

function toUpperHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The Windows FILETIME tick string for `now`, rounded down to the token
 *  window. `skewMs` corrects a clock the service disagrees with. */
function tickString(now: number, skewMs: number): string {
	const seconds = Math.floor((now + skewMs) / 1000) + WIN_EPOCH;
	const windowed = seconds - (seconds % TOKEN_WINDOW_SECONDS);
	// 10^7 ticks per second, as an integer decimal string. A Number would lose
	// precision here, so the multiplication is done on the string's last digits.
	return `${windowed}0000000`;
}

/** Mint one `Sec-MS-GEC` token (v2 form: "<CS64>-<SHA256>"). */
export function secMsGec(now: number = Date.now(), skewMs = 0): string {
	const message = new TextEncoder().encode(EDGE_COPYRIGHT + tickString(now, skewMs) + TRUSTED_CLIENT_TOKEN);
	const digest = createHash("sha256").update(message).digest();
	const digestBytes = new Uint8Array(digest);
	return `${toUpperHex(cs64(message, digestBytes))}-${toUpperHex(digestBytes)}`;
}

// --- The WebSocket session ------------------------------------------------

/** One synthesis request. */
export interface EdgeSynthesisRequest {
	/** The text to speak. Edge escapes it into SSML. */
	text: string;
	/** The Edge voice id, e.g. "zh-CN-XiaoxiaoNeural". */
	voice: string;
	/** Speaking rate as a multiplier (1 = normal). Edge takes a percentage. */
	speed?: number;
	/** The BCP-47 language for the SSML `xml:lang`. Falls back to the voice's
	 *  own prefix, which is always correct for these ids. */
	lang?: string;
}

/** A synthesis failure that knows whether retrying after a clock correction
 *  might help, and how far the server's clock disagreed with ours. */
export class EdgeSynthesisError extends Error {
	readonly retryable: boolean;
	/** The skew the server implied (server time − local time), in ms. Only
	 *  present when the server told us, which is the only case a retry helps. */
	readonly skewMs?: number;
	constructor(message: string, retryable = false, skewMs?: number) {
		super(message);
		this.name = "EdgeSynthesisError";
		this.retryable = retryable;
		this.skewMs = skewMs;
	}
}

/** Escape the five XML metacharacters. Edge parses the text as SSML, so an
 *  unescaped "&" or "<" would drop the whole request. */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Map a speed multiplier to Edge's `prosody rate` percentage.
 *
 *  The slider range (0.5–1.5) maps linearly to -50%..+50%. Edge accepts a
 *  bare signed percentage; 0% would be "unchanged" and is omitted so the
 *  default prosody model is used verbatim. */
export function edgeRate(speed: number): string | null {
	if (!Number.isFinite(speed)) return null;
	const percent = Math.round((speed - 1) * 100);
	if (percent === 0) return null;
	return `${percent > 0 ? "+" : ""}${percent}%`;
}

/** The voice's language prefix ("zh-CN-XiaoxiaoNeural" → "zh-CN"). */
function voiceLang(voice: string): string {
	const match = /^([A-Za-z]{2,3}-[A-Za-z]{2,4})-/.exec(voice);
	return match?.[1] ?? "en-US";
}

/** Build the SSML document for one request. */
function buildSsml(request: EdgeSynthesisRequest): string {
	const lang = request.lang ?? voiceLang(request.voice);
	const rate = edgeRate(request.speed ?? 1);
	const inner = escapeXml(request.text);
	const body = rate ? `<prosody rate="${rate}">${inner}</prosody>` : inner;
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${request.voice}">${body}</voice></speak>`;
}

/** The `speech.config` frame: output format, no per-word metadata (we do not
 *  render subtitles, so asking for boundaries only slows the stream down). */
function configFrame(): string {
	const payload = JSON.stringify({
		context: {
			synthesis: {
				audio: {
					metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
					outputFormat: OUTPUT_FORMAT,
				},
			},
		},
	});
	return `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${payload}`;
}

/** The `ssml` frame carrying the text. */
function ssmlFrame(request: EdgeSynthesisRequest): string {
	return `X-RequestId:${randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${buildSsml(request)}`;
}

/** One binary frame as bytes, whatever shape the runtime hands it over in. */
async function frameBytes(data: unknown): Promise<Buffer | null> {
	if (!data) return null;
	if (Buffer.isBuffer(data)) return data;
	if (data instanceof ArrayBuffer) return Buffer.from(data);
	if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	// undici's WebSocket falls back to a Blob for binary frames.
	const blob = data as { arrayBuffer?: () => Promise<ArrayBuffer> };
	if (typeof blob.arrayBuffer === "function") return Buffer.from(await blob.arrayBuffer());
	return null;
}

/** The date the server reports, in ms since the epoch. Used to correct a
 *  skewed local clock when the handshake is refused. */
function serverSkewMs(header: string | undefined, now: number): number | null {
	if (!header) return null;
	const parsed = Date.parse(header);
	if (!Number.isFinite(parsed)) return null;
	return parsed - now;
}

/** One attempt at a synthesis. Rejects with `EdgeSynthesisError`. */
function attempt(request: EdgeSynthesisRequest, skewMs: number): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const now = Date.now();
		const query = new URLSearchParams({
			TrustedClientToken: TRUSTED_CLIENT_TOKEN,
			ConnectionId: randomUUID().replace(/-/g, ""),
			"Sec-MS-GEC": secMsGec(now, skewMs),
			"Sec-MS-GEC-Version": `2-${CHROMIUM_FULL_VERSION}`,
		});

		let socket: WebSocket;
		try {
			socket = new WebSocket(`${WSS_BASE}?${query.toString()}`, {
				headers: {
					"User-Agent": USER_AGENT,
					Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
				},
			});
		} catch (error) {
			reject(new EdgeSynthesisError(`Edge TTS socket failed: ${(error as Error).message}`));
			return;
		}

		// Prefer raw buffers over Blob when the runtime honours the setting.
		socket.binaryType = "arraybuffer";
		const chunks: Buffer[] = [];
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;
		const finish = (outcome: { audio?: Uint8Array; error?: EdgeSynthesisError }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				socket.close();
			} catch {
				// A closed socket is the normal case; nothing to report.
			}
			if (outcome.error) reject(outcome.error);
			else resolve(outcome.audio!);
		};

		timer = setTimeout(() => finish({ error: new EdgeSynthesisError("Edge TTS timed out.", true) }), SYNTHESIS_TIMEOUT_MS);

		socket.addEventListener("open", () => {
			socket.send(configFrame());
			socket.send(ssmlFrame(request));
		});

		// A refused handshake arrives here as an HTTP error carrying the
		// response, whose Date header is what we need for the clock correction.
		socket.addEventListener("unexpected-response", (event) => {
			const response = (event as unknown as { response?: { statusCode?: number; headers?: Record<string, string | string[] | undefined> } }).response;
			const status = response?.statusCode;
			const dateHeader = response?.headers?.date;
			const header = Array.isArray(dateHeader) ? dateHeader[0] : dateHeader;
			const skew = serverSkewMs(header, Date.now());
			finish({
				error: new EdgeSynthesisError(
					`Edge TTS refused the connection (HTTP ${status ?? "?"}).`,
					status === 403 && skew !== null,
					skew ?? undefined,
				),
			});
		});

		socket.addEventListener("error", () => {
			finish({ error: new EdgeSynthesisError("Edge TTS connection failed.", true) });
		});

		socket.addEventListener("close", (event) => {
			finish({
				error: new EdgeSynthesisError(
					`Edge TTS closed the connection (code ${(event as unknown as { code?: number }).code ?? "?"}).`,
					chunks.length === 0,
				),
			});
		});

		// Frame ORDER is what makes the audio whole, so frames are consumed on
		// one serialized chain: awaiting a Blob must not let the next frame
		// overtake it. (undici hands binary frames over as a Blob unless
		// binaryType is honoured, and it is not honoured everywhere.)
		let frames: Promise<void> = Promise.resolve();
		const consume = async (data: unknown): Promise<void> => {
			// Text frames are control messages; "Path:turn.end" marks the end.
			if (typeof data === "string") {
				if (!data.includes("Path:turn.end")) return;
				const audio = Buffer.concat(chunks);
				if (audio.byteLength === 0) {
					finish({ error: new EdgeSynthesisError("Edge TTS returned no audio.") });
					return;
				}
				finish({ audio: new Uint8Array(audio) });
				return;
			}
			// Binary frames are "<uint16 header length><header><audio>".
			const buffer = await frameBytes(data);
			if (!buffer || buffer.byteLength < 2) return;
			const headerLength = buffer.readUInt16BE(0);
			if (buffer.byteLength < 2 + headerLength) return;
			const header = buffer.subarray(2, 2 + headerLength).toString("utf8");
			if (header.includes("Path:audio")) chunks.push(buffer.subarray(2 + headerLength));
		};
		socket.addEventListener("message", (event) => {
			const data = (event as unknown as { data?: unknown }).data;
			frames = frames.then(() => consume(data)).catch((error: unknown) => {
				finish({ error: new EdgeSynthesisError(`Edge TTS frame failed: ${(error as Error).message}`) });
			});
		});
	});
}

/** Synthesize one passage with Edge.
 *
 *  A 403 is retried ONCE after correcting for the clock the server reports:
 *  the token is derived from the local clock, so a machine a few minutes out
 *  of step is refused even though the request is otherwise flawless. */
export async function synthesizeWithEdge(request: EdgeSynthesisRequest): Promise<Uint8Array> {
	try {
		return await attempt(request, 0);
	} catch (error) {
		const skew = error instanceof EdgeSynthesisError && error.retryable ? error.skewMs : undefined;
		// Only a server-measured skew is worth a second attempt: with no
		// correction the retry would be byte-identical to the refusal.
		if (skew === undefined) throw error;
		return await attempt(request, skew);
	}
}
