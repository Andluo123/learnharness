import test from "node:test";
import assert from "node:assert/strict";
import { edgeRate, secMsGec } from "../src/server/edge-tts.ts";
import { speakMath } from "../src/core/speech-math.ts";
import { speechText } from "../src/core/speech-text.ts";

// --- the Sec-MS-GEC token ------------------------------------------------
//
// The token is time-derived, so the assertions pin the SHAPE and the
// determinism rather than one literal value. A regression in the algorithm
// (a wrong constant, a lost copyright prefix, a float instead of a tick
// string) changes the shape or breaks determinism within a window.

test("the edge token has the v2 shape: CS64 hex, a dash, SHA-256 hex", () => {
	const token = secMsGec(Date.UTC(2026, 10, 21, 10, 0, 0));
	assert.match(token, /^[0-9A-F]{16}-[0-9A-F]{64}$/);
});

test("the edge token is stable inside one 5-minute window", () => {
	const base = Date.UTC(2026, 10, 21, 10, 0, 0);
	// Any two instants in the same 300s slot must mint the same token: the
	// service compares tokens for equality, not for ordering.
	assert.equal(secMsGec(base), secMsGec(base + 1_000));
	assert.equal(secMsGec(base + 240_000), secMsGec(base));
});

test("the edge token changes across a window boundary", () => {
	const base = Date.UTC(2026, 10, 21, 10, 0, 0);
	assert.notEqual(secMsGec(base + 299_000), secMsGec(base + 301_000));
});

test("a clock skew shifts which window the token belongs to", () => {
	const base = Date.UTC(2026, 10, 21, 10, 0, 0);
	// A five-minute skew lands in the neighbouring window, which is exactly
	// why the transport retries once after learning the server's clock.
	assert.notEqual(secMsGec(base), secMsGec(base, 300_000));
});

// --- rate mapping --------------------------------------------------------

test("normal speed asks for no prosody override", () => {
	// 0% would be "unchanged" spelled out; omitting it lets Edge use its own
	// default prosody, which sounds better than an explicit no-op.
	assert.equal(edgeRate(1), null);
});

test("speed maps linearly onto Edge percentages", () => {
	assert.equal(edgeRate(0.5), "-50%");
	assert.equal(edgeRate(1.5), "+50%");
	assert.equal(edgeRate(1.2), "+20%");
	assert.equal(edgeRate(0.85), "-15%");
});

test("a non-finite speed is ignored rather than sent as NaN%", () => {
	assert.equal(edgeRate(Number.NaN), null);
	assert.equal(edgeRate(Number.POSITIVE_INFINITY), null);
});

// --- letter names --------------------------------------------------------

test("letter names are spelled out for a voice that misreads them", () => {
	// The Flux Mandarin voices need this crutch (see LETTER_ZH). Measured
	// against the live API: "x 等于" came back as "istron于" without it.
	assert.equal(speakMath("y=-\\frac{2}{3}x^2+2x-6", "zh"), "歪等于负三分之二艾克斯的平方加二艾克斯减六");
});

test("a voice that reads letters correctly keeps the letter itself", () => {
	// Edge reads "x" as a letter, so a phonetic stand-in ("艾克斯") would be
	// a downgrade — the caller turns the transcription off.
	assert.equal(speakMath("y=-\\frac{2}{3}x^2+2x-6", "zh", false), "y等于负三分之二x的平方加二x减六");
});

test("a negative numerator stays inside the fraction", () => {
	// "-2/3" is 三分之负二; only a minus on the WHOLE fraction is a leading
	// 「负」. Turning letter names off must not disturb that rule.
	assert.equal(speakMath("y=\\frac{-2}{3}x^2", "zh", false), "y等于三分之负二x的平方");
});

test("a URL is never rewritten by the letter transcriber", () => {
	// The operator pass protects URLs; spelling out letters inside one would
	// corrupt a link the learner may need to copy.
	assert.equal(
		speechText("见 https://example.com/a=b 这个链接", { math: "read", letterNames: false }),
		"见 https://example.com/a=b 这个链接",
	);
});
