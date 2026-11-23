import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai";
import { sanitizeRequestContext } from "../src/agent/models.ts";

/** Build a real TranscriptContext (the brand only normalizeContext mints). */
const ctx = (messages: never[]) => normalizeContext({ messages, tools: [] });

const assistant = (content: unknown[]) => ({
	role: "assistant",
	content,
	api: "openai-completions",
	provider: "agnes",
	model: "agnes-3.0-flash",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
	stopReason: "toolUse",
	timestamp: 1,
});
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }], timestamp: 1 });
const result = (toolCallId: string, toolName: string, isError = false) => ({
	role: "toolResult", toolCallId, toolName,
	content: [{ type: "text", text: "r" }], isError, timestamp: 1,
});

describe("sanitizeRequestContext (the Agnes 400 request boundary)", () => {
	it("leaves a clean context untouched (same array identity)", () => {
		const context = ctx([user("hi"), assistant([{ type: "toolCall", id: "call_1", name: "quiz", arguments: {} }]), result("call_1", "quiz")] as never[]);
		const before = context.messages;
		sanitizeRequestContext(context);
		assert.equal(context.messages, before);
	});

	it("drops a synthesized tool result with empty ids", () => {
		const context = ctx([user("hi"), assistant([{ type: "text", text: "ok" }]), result("", "", true)] as never[]);
		sanitizeRequestContext(context);
		assert.equal(context.messages.length, 2);
		assert.equal(context.messages[1]!.role, "assistant");
	});

	it("strips an empty tool-call block but keeps the assistant text", () => {
		const context = ctx([
			user("hi"),
			assistant([{ type: "text", text: "let me check" }, { type: "toolCall", id: "", name: "", arguments: {} }]),
			result("", "", true),
			user("again"),
		] as never[]);
		sanitizeRequestContext(context);
		const a = context.messages[1] as { content: Array<{ type: string }> };
		assert.deepEqual(a.content.map((c) => c.type), ["text"]);
		assert.equal(context.messages.length, 3, "the empty-id result is dropped too — no dangling tool message");
	});

	it("keeps well-formed calls and results of a mixed message", () => {
		const context = ctx([
			assistant([
				{ type: "toolCall", id: "call_ok", name: "quiz", arguments: {} },
				{ type: "toolCall", id: "", name: "", arguments: {} },
			]),
			result("call_ok", "quiz"),
			result("", "", true),
		] as never[]);
		sanitizeRequestContext(context);
		const a = context.messages[0] as { content: Array<{ type: string; id?: string }> };
		assert.equal(a.content.length, 1);
		assert.equal(a.content[0]!.id, "call_ok");
		assert.equal(context.messages.length, 2, "only the empty-id result is dropped");
	});

	it("is idempotent", () => {
		const context = ctx([
			assistant([{ type: "toolCall", id: "", name: "", arguments: {} }, { type: "text", text: "x" }]),
			result("", "", true),
		] as never[]);
		sanitizeRequestContext(context);
		const once = JSON.stringify(context.messages);
		sanitizeRequestContext(context);
		assert.equal(JSON.stringify(context.messages), once);
	});
});
