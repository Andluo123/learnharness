import assert from "node:assert/strict";
import { test } from "node:test";
import { createDictationLanguageStore } from "../components/dictation-preference.ts";

async function lang(promiseOrSettings: Promise<{ language?: string }> | { language?: string }): Promise<string> {
	const s = await promiseOrSettings;
	return s.language ?? "en";
}

test("all readers immediately receive the confirmed write without another GET", async () => {
	let reads = 0;
	let notifications = 0;
	let failReads = false;
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") return Response.json({ settings: { version: 1, dictation: JSON.parse(init.body as string) } });
		reads++;
		return failReads ? Response.json({}, { status: 500 }) : Response.json({ settings: null });
	}, () => { notifications++; });
	assert.equal(await lang(store.load()), "en");
	const observed: string[] = [];
	const off = store.subscribe(() => { observed.push(`${store.getSnapshot().language}:${store.getSnapshot().saving}`); });
	failReads = true;
	assert.equal(await store.save({ language: "multi" }), true);
	assert.equal(await lang(store.getSettings()), "multi");
	assert.equal(reads, 1);
	assert.equal(notifications, 1);
	assert(observed.includes("multi:true"));
	assert.equal(observed.at(-1), "multi:false");
	off();
});

test("ordinary loads and repeated recordings reuse the initial confirmed value", async () => {
	let reads = 0;
	const store = createDictationLanguageStore(async () => {
		reads++;
		if (reads > 1) throw new Error("should not reread");
		return Response.json({ settings: { version: 1, dictation: { language: "fr" } } });
	});
	assert.deepEqual(await Promise.all([lang(store.getSettings()), lang(store.load())]), ["fr", "fr"]);
	for (let i = 0; i < 3; i++) {
		const unsubscribe = store.subscribe(() => {});
		assert.equal(await lang(store.getSettings()), "fr");
		assert.equal(await lang(store.load()), "fr");
		unsubscribe();
	}
	assert.equal(reads, 1);
});

test("a failed external refresh invalidates the cache until a successful retry", async () => {
	let fail = false;
	const store = createDictationLanguageStore(async () => fail
		? Response.json({}, { status: 500 })
		: Response.json({ settings: { version: 1, dictation: { language: "pl" } } }));
	await store.load();
	fail = true;
	await assert.rejects(store.load(true), /Could not load/);
	await assert.rejects(store.getSettings(), /Could not load/);
	fail = false;
	assert.equal(await lang(store.getSettings()), "pl");
	assert.equal(store.getSnapshot().error, null);
});

test("stale reads cannot overwrite a newer write and subscribers see busy before transport runs", async () => {
	let stale!: (response: Response) => void;
	let nextRead: Promise<Response> | undefined;
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") return Response.json({ settings: { version: 1, dictation: { language: "multi" } } });
		if (nextRead) { const response = nextRead; nextRead = undefined; return response; }
		return Response.json({ settings: { version: 1, dictation: { language: "pl" } } });
	});
	await store.load();
	nextRead = new Promise((resolve) => { stale = resolve; });
	const oldRead = store.load(true);
	await Promise.resolve();
	let startedDuringPublish: Promise<string> | undefined;
	const off = store.subscribe(() => {
		if (store.getSnapshot().saving && !startedDuringPublish) startedDuringPublish = lang(store.getSettings());
	});
	assert.equal(await store.save({ language: "multi" }), true);
	stale(Response.json({ settings: { version: 1, dictation: { language: "pl" } } }));
	assert.equal((await oldRead).language, "multi");
	assert.equal(await startedDuringPublish, "multi");
	assert.equal(store.getSnapshot().language, "multi");
	off();
});

for (const newestFirst of [false, true]) test(`overlapping reads keep the newest value, newest resolves first: ${newestFirst}`, async () => {
	const responses: ((response: Response) => void)[] = [];
	const store = createDictationLanguageStore(() => new Promise((resolve) => { responses.push(resolve); }));
	const first = store.load();
	await Promise.resolve();
	const second = store.load(true);
	await Promise.resolve();
	const old = Response.json({ settings: { version: 1, dictation: { language: "pl" } } });
	const fresh = Response.json({ settings: { version: 1, dictation: { language: "multi" } } });
	if (newestFirst) { responses[1]!(fresh); responses[0]!(old); }
	else { responses[0]!(old); responses[1]!(fresh); }
	assert.deepEqual(await Promise.all([lang(first), lang(second)]), ["multi", "multi"]);
	assert.equal(await lang(store.getSettings()), "multi");
});

test("capture also waits for a write initiated as a pending read publishes its result", async () => {
	const store = createDictationLanguageStore(async (_url, init) => Response.json({ settings: {
		version: 1, dictation: { language: init?.method === "PUT" ? "multi" : "en" },
	} }));
	let started = false;
	const off = store.subscribe(() => {
		if (!started && (store.getSnapshot().language ?? "en") === "en") {
			started = true;
			void store.save({ language: "multi" });
		}
	});
	assert.equal(await lang(store.getSettings()), "multi");
	off();
});

test("toggling one dictation field keeps its siblings (PUT replaces the whole section)", async () => {
	let stored: Record<string, unknown> = { language: "zh-CN" };
	let writes = 0;
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") {
			writes++;
			// The route replaces the whole dictation section with the body.
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, dictation: stored } });
		}
		return Response.json({ settings: { version: 1, dictation: stored } });
	});
	await store.load();
	assert.equal(await store.save({ detectLanguage: true }), true);
	assert.equal(await store.save({ autoSend: true }), true);
	assert.equal(await store.save({ continuousReadback: true }), true);
	assert.deepEqual(stored, {
		language: "zh-CN",
		detectLanguage: true,
		autoSend: true,
		continuousReadback: true,
	});
	assert.equal(writes, 3);
	assert.deepEqual(
		{ ...store.getSnapshot(), error: undefined },
		{ language: "zh-CN", detectLanguage: true, autoSend: true, continuousReadback: true, saving: false, error: undefined },
	);
});

test("a partial stored section resolves every absent field to its factory value", async () => {
	const store = createDictationLanguageStore(async () => Response.json({
		settings: { version: 1, dictation: { detectLanguage: true } },
	}));
	const settings = await store.load();
	assert.deepEqual(settings, { language: "en", detectLanguage: true, autoSend: false, continuousReadback: false });
});


test("two concurrent toggles on independent flags both land (a click is never lost)", async () => {
	let stored: Record<string, unknown> = { language: "zh-CN" };
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") {
			// The route replaces the whole dictation section with the body.
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, dictation: stored } });
		}
		return Response.json({ settings: { version: 1, dictation: stored } });
	});
	await store.load();
	const [first, second] = await Promise.all([
		store.save({ detectLanguage: true }),
		store.save({ autoSend: true }),
	]);
	// Neither toggle may cancel the other, and neither may be lost.
	assert.deepEqual([first, second], [true, true]);
	assert.equal(stored.detectLanguage, true);
	assert.equal(stored.autoSend, true);
	assert.equal(store.getSnapshot().detectLanguage, true);
	assert.equal(store.getSnapshot().autoSend, true);
	assert.equal(store.getSnapshot().saving, false);
});

test("a competing selection of the same exclusive choice is rejected", async () => {
	let stored: Record<string, unknown> = { language: "zh-CN" };
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const store = createDictationLanguageStore(async (_url, init) => {
		if (init?.method === "PUT") {
			await gate;
			stored = JSON.parse(init.body as string) as Record<string, unknown>;
			return Response.json({ settings: { version: 1, dictation: stored } });
		}
		return Response.json({ settings: { version: 1, dictation: stored } });
	});
	await store.load();
	const first = store.save({ language: "multi" });
	// The language is one exclusive choice: a second selection must never
	// inherit the pending write's success.
	assert.equal(await store.save({ language: "en" }), false);
	release();
	assert.equal(await first, true);
	assert.equal(stored.language, "multi");
});
