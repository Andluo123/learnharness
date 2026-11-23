import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpeechStore } from "../components/speech-preference.ts";

test("toggling one speech field keeps its siblings (PUT replaces the whole section)", async () => {
	let stored: Record<string, unknown> = { autoRead: false, voice: "flux-wenjing-zh" };
	let writes = 0;
	const store = createSpeechStore(async (_url, init) => {
		if (init?.method === "PUT") {
			writes++;
			// The section route replaces the whole speech section with the body.
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, speech: stored } });
		}
		return Response.json({ settings: { version: 1, speech: stored } });
	});
	await store.load();
	assert.equal(await store.save({ autoRead: true }), true);
	assert.equal(await store.save({ readCode: true }), true);
	assert.equal(stored.autoRead, true);
	assert.equal(stored.readCode, true);
	assert.equal(stored.voice, "flux-wenjing-zh");
	assert.equal(writes, 2);
	assert.equal(store.getSnapshot().config.autoRead, true);
	assert.equal(store.getSnapshot().config.readCode, true);
	assert.equal(store.getSnapshot().saving, false);
});

test("a partial stored section resolves every absent field to its factory value", async () => {
	const store = createSpeechStore(async () => Response.json({
		settings: { version: 1, speech: { autoRead: true } },
	}));
	const config = await store.load();
	// The factory default is Edge (owner decision 2026-11-21): it reads
	// formulas better and needs no credential.
	assert.equal(config.provider, "edge");
	assert.equal(config.voice, "zh-CN-XiaoxiaoNeural");
	assert.equal(config.speed, 1);
	assert.equal(config.language, "auto");
	assert.equal(config.autoRead, true);
	assert.equal(config.readCode, false);
	assert.equal(config.readMath, true);
	assert.equal(config.format, "mp3");
});

test("two concurrent flips on independent flags both land (a click is never lost)", async () => {
	let stored: Record<string, unknown> = { autoRead: false, readCode: false };
	const store = createSpeechStore(async (_url, init) => {
		if (init?.method === "PUT") {
			// The section route replaces the whole speech section with the body.
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, speech: stored } });
		}
		return Response.json({ settings: { version: 1, speech: stored } });
	});
	await store.load();
	const [first, second] = await Promise.all([
		store.save({ autoRead: true }),
		store.save({ readCode: true }),
	]);
	// Neither flip may cancel the other, and neither may be lost.
	assert.deepEqual([first, second], [true, true]);
	assert.equal(stored.autoRead, true);
	assert.equal(stored.readCode, true);
	assert.equal(store.getSnapshot().config.autoRead, true);
	assert.equal(store.getSnapshot().config.readCode, true);
	assert.equal(store.getSnapshot().saving, false);
});

test("a competing selection of the same exclusive choice is rejected", async () => {
	let stored: Record<string, unknown> = { voice: "flux-wenjing-zh" };
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const store = createSpeechStore(async (_url, init) => {
		if (init?.method === "PUT") {
			await gate;
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, speech: stored } });
		}
		return Response.json({ settings: { version: 1, speech: stored } });
	});
	await store.load();
	const first = store.save({ voice: "flux-haoran-zh" });
	// The voice is one exclusive choice: a second selection must never
	// inherit the pending write's success.
	assert.equal(await store.save({ voice: "flux-jian-zh" }), false);
	release();
	assert.equal(await first, true);
	assert.equal(stored.voice, "flux-haoran-zh");
});

test("a failed flip rolls back to the last confirmed configuration", async () => {
	let stored: Record<string, unknown> = { autoRead: false, readCode: false };
	let writes = 0;
	const store = createSpeechStore(async (_url, init) => {
		if (init?.method === "PUT") {
			writes++;
			// The second write fails at the transport.
			if (writes === 2) return Response.json({}, { status: 500 });
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, speech: stored } });
		}
		return Response.json({ settings: { version: 1, speech: stored } });
	});
	await store.load();
	assert.equal(await store.save({ autoRead: true }), true);
	assert.equal(await store.save({ readCode: true }), false);
	assert.equal(store.getSnapshot().config.autoRead, true);
	assert.equal(store.getSnapshot().config.readCode, false);
	assert.match(store.getSnapshot().error!, /Could not save/);
});
