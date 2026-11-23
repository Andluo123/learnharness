import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import type { QuizFigure } from "../src/core/quiz-figures.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { QuizToolInput } from "../src/core/question-core.ts";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});

const FIGURES: ReadonlyMap<string, QuizFigure> = new Map([
	["call_fig", { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><circle r=\"5\"/></svg>" }],
]);

const quizMessage = (input: Record<string, unknown>): LhMessage => ({
	id: "m1", role: "assistant",
	content: [{ type: "toolCall", id: "call_q", name: "quiz", arguments: input }],
	stopReason: "toolUse", timestamp: 1,
} as unknown as LhMessage);

async function renderDock(input: Record<string, unknown>, figures?: ReadonlyMap<string, QuizFigure>) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		void root.render(<QuestionDock
			key="question:call_q"
			toolName="quiz"
			toolCallId="call_q"
			input={input as QuizToolInput}
			expanded
			onExpand={() => {}}
			onSubmit={() => {}}
			dictationClaim={false}
			figures={figures}
		/>);
	});
	return { host, root };
}

async function teardown({ host, root }: { host: HTMLElement; root: ReturnType<typeof createRoot> }) {
	await act(async () => { root.unmount(); });
	host.remove();
}

const baseInput = {
	question: "What is angle x?",
	options: [{ label: "A", value: "a" }, { label: "B", value: "b" }],
	correctAnswer: "a",
	explanation: "Straight angle.",
};

test("a quiz figure renders above the question text", async () => {
	const view = await renderDock({ ...baseInput, figure: "call_fig" }, FIGURES);
	try {
		const figure = view.host.querySelector('[data-testid="quiz-figure"]');
		assert.ok(figure, "the delivered figure renders in the card");
		assert.equal(figure!.getAttribute("data-figure-size"), "question");
		const img = figure!.querySelector("img");
		assert.ok(img && img.getAttribute("src")?.startsWith("data:image/svg+xml"), "the SVG renders through the image boundary");
		// Above the question text: the figure precedes the question paragraph.
		const text = view.host.textContent ?? "";
		assert.match(text, /What is angle x\?/);
	} finally { await teardown(view); }
});

test("option figures render inside their option rows", async () => {
	const view = await renderDock({
		...baseInput,
		options: [
			{ label: "A", value: "a", figure: "call_fig" },
			{ label: "B", value: "b" },
		],
	}, FIGURES);
	try {
		const figures = view.host.querySelectorAll('[data-testid="quiz-figure"]');
		assert.equal(figures.length, 1, "only the option that references a figure shows one");
		assert.equal(figures[0]!.getAttribute("data-figure-size"), "option");
	} finally { await teardown(view); }
});

test("an unknown or absent reference renders no figure (never a hole, never a crash)", async () => {
	for (const reference of ["call_ghost", "", undefined]) {
		const view = await renderDock({ ...baseInput, figure: reference }, FIGURES);
		try {
			assert.equal(view.host.querySelector('[data-testid="quiz-figure"]'), null, `reference ${String(reference)} renders nothing`);
			assert.match(view.host.textContent ?? "", /What is angle x\?/, "the question still renders");
		} finally { await teardown(view); }
	}
});

test("no figures map at all renders no figure", async () => {
	const view = await renderDock({ ...baseInput, figure: "call_fig" }, undefined);
	try {
		assert.equal(view.host.querySelector('[data-testid="quiz-figure"]'), null);
		assert.match(view.host.textContent ?? "", /What is angle x\?/);
	} finally { await teardown(view); }
});

test("a quiz with no figure field renders exactly the old card", async () => {
	const view = await renderDock(baseInput, FIGURES);
	try {
		assert.equal(view.host.querySelector('[data-testid="quiz-figure"]'), null);
		assert.match(view.host.textContent ?? "", /What is angle x\?/);
	} finally { await teardown(view); }
});
