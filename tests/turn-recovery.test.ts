import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { ChatStore } from "../src/core/ports.ts";
import { runPiTurn } from "../src/server/pi/ui-stream.ts";
import { persistTurn } from "../src/server/turn-service.ts";

/** No engine or network: exercise the runner's awaited listener seam. */
function agentEndingWith(loopFailure?: Error): Agent {
	const listeners: Array<(event: never) => unknown> = [];
	return {
		state: { messages: [] },
		subscribe(listener: (event: never) => unknown) { listeners.push(listener); return () => {}; },
		async continue() {
			await Promise.resolve(); // let the view subscribe before the terminal
			if (loopFailure) throw loopFailure;
			for (const listener of listeners) await listener({ type: "agent_end", messages: [] } as never);
		},
		abort() {},
	} as unknown as Agent;
}

function wireFrames(wire: string): string[] {
	return wire.split("\n\n").filter(Boolean).map(frame => frame.slice("data: ".length));
}

describe("turn settlement recovery", () => {
	it("reports a failed canonical save before DONE and cleans up before reporting", async () => {
		const order: string[] = [];
		const handle = runPiTurn({
			agent: agentEndingWith(),
			onFinish() { order.push("save"); throw new Error("synthetic disk failure"); },
			onSettleFailure() { order.push("cleanup"); },
			onSettleError() { order.push("report"); return "The reply could not be saved."; },
		});
		const frames = wireFrames(await new Response(handle.subscribe()).text());
		assert.deepEqual(order, ["save", "cleanup", "report"]);
		assert.equal(frames.at(-1), "[DONE]");
		assert.equal(frames.filter(f => f.includes('"type":"error"')).length, 1);
		assert.ok(frames.at(-2)?.includes("The reply could not be saved."));
	});

	it("still reports settlement failure when cleanup itself throws", async () => {
		const handle = runPiTurn({
			agent: agentEndingWith(),
			onFinish() { throw new Error("synthetic save failure"); },
			onSettleFailure() { throw new Error("synthetic cleanup failure"); },
			onSettleError: () => "The reply could not be saved.",
		});
		const frames = wireFrames(await new Response(handle.subscribe()).text());
		assert.equal(frames.at(-1), "[DONE]");
		assert.equal(frames.filter(f => f.includes('"type":"error"')).length, 1);
	});

	it("does not replace an already reported loop failure with a second settlement error", async () => {
		let cleanups = 0;
		const handle = runPiTurn({
			agent: agentEndingWith(new Error("synthetic loop failure")),
			onError: () => "An error occurred.",
			onFinish() { throw new Error("synthetic save failure"); },
			onSettleFailure(error, reportedErrorText) {
				cleanups++;
				assert.match(String(error), /synthetic save failure/);
				assert.equal(reportedErrorText, "An error occurred.");
			},
		});
		const frames = wireFrames(await new Response(handle.subscribe()).text());
		assert.equal(cleanups, 1);
		assert.equal(frames.filter(f => f.includes('"type":"error"')).length, 1);
		assert.equal(frames.at(-1), "[DONE]");
	});

	it("a healthy terminal follows persistence and emits no error", async () => {
		let saves = 0;
		const handle = runPiTurn({ agent: agentEndingWith(), onFinish() { saves++; } });
		const frames = wireFrames(await new Response(handle.subscribe()).text());
		assert.equal(saves, 1);
		assert.equal(frames.at(-1), "[DONE]");
		assert.equal(frames.some(f => f.includes('"type":"error"')), false);
	});

	it("does not contain a canonical write failure as an empty successful persist", () => {
		const store = {
			getChat: () => ({ messages: [] }),
			saveMessages() { throw new Error("synthetic disk failure"); },
		} as unknown as ChatStore;
		const message = { role: "assistant", content: [{ type: "text", text: "Synthetic reply" }], stopReason: "stop", timestamp: 1 } as AgentMessage;
		assert.throws(() => persistTurn(store, "fixture", 0, [message], false), /The reply could not be saved\./);
	});

	// DIRTY TOOL-CALL DEFENSE (the Agnes 400, 2026-11-18): a hallucinated empty
	// tool call makes pi synthesize a toolResult with empty ids. Either shape in
	// the record fails EVERY later request ("missing field `tool_call_id`"), so
	// persistTurn must never write them.
	it("never persists a tool result with empty ids", () => {
		const saved: unknown[][] = [];
		const store = {
			getChat: () => ({ messages: [] }),
			saveMessages(_id: string, messages: unknown[]) { saved.push(messages); },
		} as unknown as ChatStore;
		const dirty = { role: "toolResult", toolCallId: "", toolName: "", content: [{ type: "text", text: "Tool  not found" }], isError: true, timestamp: 2 } as unknown as AgentMessage;
		const clean = { role: "toolResult", toolCallId: "call_ok", toolName: "read", content: [{ type: "text", text: "fine" }], isError: false, timestamp: 3 } as unknown as AgentMessage;
		const stamped = persistTurn(store, "fixture", 0, [dirty, clean], false);
		assert.equal(stamped.length, 1);
		assert.equal((stamped[0] as { toolCallId: string }).toolCallId, "call_ok");
	});

	it("strips empty tool-call blocks from an assistant message but keeps its text", () => {
		const store = {
			getChat: () => ({ messages: [] }),
			saveMessages() {},
		} as unknown as ChatStore;
		const assistant = {
			role: "assistant",
			content: [
				{ type: "text", text: "Thinking out loud" },
				{ type: "toolCall", id: "", name: "", arguments: {} },
			],
			stopReason: "toolUse",
			timestamp: 4,
		} as unknown as AgentMessage;
		const stamped = persistTurn(store, "fixture", 0, [assistant], false);
		assert.equal(stamped.length, 1);
		const content = (stamped[0] as { content: Array<{ type: string }> }).content;
		assert.deepEqual(content.map((c) => c.type), ["text"]);
	});

	it("leaves a well-formed assistant tool call untouched", () => {
		const store = {
			getChat: () => ({ messages: [] }),
			saveMessages() {},
		} as unknown as ChatStore;
		const assistant = {
			role: "assistant",
			content: [{ type: "toolCall", id: "call_1", name: "quiz", arguments: { q: 1 } }],
			stopReason: "toolUse",
			timestamp: 5,
		} as unknown as AgentMessage;
		const stamped = persistTurn(store, "fixture", 0, [assistant], false);
		const content = (stamped[0] as { content: Array<{ type: string; id?: string }> }).content;
		assert.equal(content.length, 1);
		assert.equal(content[0]!.id, "call_1");
	});
});
