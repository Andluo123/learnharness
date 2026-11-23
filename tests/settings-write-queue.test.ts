import assert from "node:assert/strict";
import { test } from "node:test";

import { createWriteQueue } from "../src/core/settings-write-queue.ts";

interface Config {
	voice: string;
	autoRead: boolean;
	readCode: boolean;
}

function harness(options: { exclusive?: string[]; fail?: (body: Config) => boolean } = {}) {
	let confirmed: Config = { voice: "a", autoRead: false, readCode: false };
	const published: Array<Partial<Config>> = [];
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	const queue = createWriteQueue<Config>({
		exclusiveFields: options.exclusive ?? ["voice"],
		confirmed: () => confirmed,
		confirm: (next) => { confirmed = next; },
		body: (base, patch) => ({ ...base, ...patch }),
		read: (payload) => (payload as Config | null) ?? null,
		project: (fields, next) => {
			const picked: Partial<Config> = {};
			for (const field of fields) (picked as Record<string, unknown>)[field] = (next as unknown as Record<string, unknown>)[field];
			published.push(picked);
		},
		send: async (body) => {
			// The transport is gated so a pending write stays pending until the
			// test releases it.
			await gate;
			if (options.fail?.(body)) throw new Error("nope");
			return body;
		},
		saved: () => {},
		failed: () => {},
	});
	return { queue, confirmed: () => confirmed, published, release };
}

test("an empty patch is rejected", async () => {
	const { queue } = harness();
	assert.equal(await queue.write({}), false);
});

test("writes run one at a time, in order", async () => {
	const { queue, confirmed, release } = harness();
	const order: string[] = [];
	const first = queue.write({ autoRead: true });
	const second = queue.write({ readCode: true });
	release();
	await Promise.all([first, second]);
	order.push("done");
	assert.deepEqual(order, ["done"]);
	assert.equal(confirmed().autoRead, true);
	assert.equal(confirmed().readCode, true);
});

test("a competing exclusive selection is rejected while the first is pending", async () => {
	const { queue, confirmed, release } = harness();
	const first = queue.write({ voice: "b" });
	assert.equal(await queue.write({ voice: "c" }), false);
	// The rejected write must not have changed the confirmed value.
	assert.equal(confirmed().voice, "a");
	release();
	await first;
	assert.equal(confirmed().voice, "b");
});

test("a non-exclusive write is queued instead of rejected", async () => {
	const { queue, confirmed, release } = harness();
	const first = queue.write({ voice: "b" });
	const second = queue.write({ autoRead: true });
	release();
	await Promise.all([first, second]);
	assert.equal(confirmed().voice, "b");
	assert.equal(confirmed().autoRead, true);
});

test("a failed write reports the failure and leaves the confirmed value alone", async () => {
	const { queue, confirmed, release } = harness({ fail: () => true });
	const pending = queue.write({ autoRead: true });
	release();
	assert.equal(await pending, false);
	assert.equal(confirmed().autoRead, false);
});

test("conflicts() reports a pending exclusive field without writing anything", async () => {
	const { queue, release } = harness();
	const first = queue.write({ voice: "b" });
	assert.equal(queue.conflicts({ voice: "c" }), true);
	assert.equal(queue.conflicts({ autoRead: true }), false);
	release();
	await first;
	assert.equal(queue.conflicts({ voice: "c" }), false);
});

test("busy() is true while a write is queued and false once it settled", async () => {
	const { queue, release } = harness();
	const first = queue.write({ autoRead: true });
	assert.equal(queue.busy(), true);
	release();
	await first;
	assert.equal(queue.busy(), false);
});
