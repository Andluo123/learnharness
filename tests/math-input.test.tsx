import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseHTML } from "linkedom";
import type { Root } from "react-dom/client";
import { ChatSessionComposer } from "../components/composer.tsx";
import { INSERT_MATH_EVENT, type InsertMathDetail } from "../components/path-input.tsx";
import { readPathInput } from "../components/path-input-dom.ts";

const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
let active: Element = document.body;
Object.defineProperty(document, "activeElement", { get: () => active });
const selection = {
	anchorNode: null as Node | null, anchorOffset: 0, focusNode: null as Node | null, focusOffset: 0,
	setBaseAndExtent(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) {
		Object.assign(this, { anchorNode, anchorOffset, focusNode, focusOffset });
	},
};
Object.assign(document, { getSelection: () => selection, oninput: null });
window.HTMLElement.prototype.focus = function () { active = this; };
Object.assign(globalThis, { window, document, Element: window.Element, HTMLElement: window.HTMLElement, Event: window.Event, CustomEvent: window.CustomEvent });

const roots: { root: Root; host: HTMLElement }[] = [];
async function mount(element: React.ReactElement) {
	const host = document.createElement("div") as unknown as HTMLElement;
	document.body.append(host);
	const { createRoot } = await import("react-dom/client");
	const root = createRoot(host);
	roots.push({ root, host });
	await act(async () => { root.render(element); });
	return host;
}
afterEach(async () => {
	for (const { root, host } of roots.splice(0)) { await act(async () => { root.unmount(); }); host.remove(); }
});

describe("math formula insertion into the composer", () => {
	async function composer() {
		let latest = "";
		const host = await mount(<ChatSessionComposer
			busy={false} value="" revision={0}
			onChange={(value) => { latest = value; }} onSend={() => {}} onStop={() => {}}
			sendAllowed dictationActive={false}
		/>);
		const editor = host.querySelector<HTMLElement>("[data-file-path-input]");
		assert.ok(editor);
		return { editor, read: () => latest };
	}
	async function insert(editor: HTMLElement, detail: InsertMathDetail) {
		await act(async () => { editor.dispatchEvent(new window.CustomEvent(INSERT_MATH_EVENT, { detail })); });
	}

	it("inserts inline LaTeX wrapped in single dollars", async () => {
		const { editor, read } = await composer();
		await insert(editor, { tex: "y = x^2 - 5x + 6", inline: true });
		assert.equal(read(), "$y = x^2 - 5x + 6$");
		assert.equal(readPathInput(editor), "$y = x^2 - 5x + 6$");
	});

	it("inserts display LaTeX on its own $$ lines", async () => {
		const { editor, read } = await composer();
		await insert(editor, { tex: "\Delta = b^2 - 4ac", inline: false });
		assert.equal(read(), "$$\n\Delta = b^2 - 4ac\n$$");
	});

	it("ignores empty formulas", async () => {
		const { editor, read } = await composer();
		await insert(editor, { tex: "  ", inline: true });
		assert.equal(read(), "");
	});
});
describe("visual math editor regressions", () => {
  it("uses the correct keyboard policy, resets on close, and keeps keyboard explicit", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../components/math-editor.tsx", import.meta.url), "utf8");
    assert.ok(src.includes("mf.mathVirtualKeyboardPolicy ="), "uses the real MathLive policy property");
    assert.ok(!src.includes("virtualKeyboardMode"), "old wrong option is gone");
    assert.ok(src.includes("setReady(false)"), "ready resets on close so reopen recreates the field");
    assert.ok(src.includes("document.createElement(\"math-field\")"), 'a fresh field is created on open');
    assert.ok(src.includes("mathVirtualKeyboard?.hide()"), "keyboard is hidden on close");
    assert.ok(src.includes("z-[200]"), "dialog stacks above the MathLive keyboard");
    assert.ok(src.includes("ML__keyboard"), "keyboard clicks are not treated as outside clicks");
    assert.ok(src.includes("boundingRect.height"), "dialog rides above keyboard height");
  });

  it("binds the math button to the question dock answer field", async () => {
    const { readFile } = await import("node:fs/promises");
    const dock = await readFile(new URL("../components/question-dock.tsx", import.meta.url), "utf8");
    assert.ok(dock.includes("answerFieldRef"), "answer field ref exists");
    assert.ok(dock.includes("ref={answerFieldRef}"), 'ref is bound to the PathInput');
    assert.ok(dock.includes("<MathEditorButton editorRef="), "math button is mounted in the dock");
  });
});
