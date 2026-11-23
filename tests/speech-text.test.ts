import test from "node:test";
import assert from "node:assert/strict";
import {
	speechChunks,
	speechSegments,
	speechSentences,
	speechText,
} from "../src/core/speech-text.ts";

test("code blocks are skipped by default and kept on request", () => {
	const md = "看这段代码：\n\n```ts\nconst x = 1;\n```\n\n结束。";
	const skipped = speechSegments(md);
	assert.equal(skipped.length, 2); // the prose before and after the block
	assert.match(skipped[0]!.text, /看这段代码/);
	assert.match(skipped[1]!.text, /结束/);
	assert.doesNotMatch(skipped.map((s) => s.text).join(" "), /const x/);

	const kept = speechSegments(md, { readCode: true });
	assert.ok(kept.some((segment) => segment.kind === "code"));
	assert.ok(kept.some((segment) => segment.text.includes("const x = 1;")));
});

test("math is skipped by default and labelled on request", () => {
	const md = "公式是 $x^2 + y^2$ 这样。";
	assert.doesNotMatch(speechText(md), /x\^2/);
	assert.match(speechText(md, { math: "label" }), /公式/);
});

test("links keep their label and lose their target", () => {
	const text = speechText("看 [官方文档](https://example.com/a?b=c) 这里。");
	assert.match(text, /官方文档/);
	assert.doesNotMatch(text, /example\.com/);
});

test("images lose their markup but keep their alt text", () => {
	const text = speechText("![三角形图](/tmp/a.png)后面");
	assert.match(text, /三角形图/);
	assert.doesNotMatch(text, /a\.png/);
	assert.doesNotMatch(text, /!\[/);
});

test("table rows become comma-joined cells", () => {
	const md = "| 名称 | 值 |\n| --- | --- |\n| 甲 | 12 |\n| 乙 | 34 |";
	const text = speechText(md);
	assert.match(text, /名称, 值/);
	assert.match(text, /甲, 12/);
	assert.doesNotMatch(text, /\|/);
});

test("markdown punctuation is stripped but the words stay", () => {
	const text = speechText("## 标题\n\n- 第一项\n- 第二项\n\n**强调** 和 *斜体* 和 ~~删除~~");
	assert.doesNotMatch(text, /#/);
	assert.doesNotMatch(text, /\*\*/);
	assert.doesNotMatch(text, /~~/);
	assert.match(text, /标题/);
	assert.match(text, /第一项/);
	assert.match(text, /强调/);
	assert.match(text, /斜体/);
	assert.match(text, /删除/);
});

test("sentences split on both Chinese and English terminators", () => {
	assert.deepEqual(speechSentences("第一句。第二句！"), ["第一句。", "第二句！"]);
	assert.deepEqual(speechSentences("One. Two?"), ["One.", "Two?"]);
});

test("chunks respect the limit and split long pieces", () => {
	const md = "第一句话内容比较长。" + "第二句话内容也比较长。".repeat(20);
	const chunks = speechChunks(md, 40);
	assert.ok(chunks.length > 1);
	for (const chunk of chunks) assert.ok(chunk.length <= 40, `chunk too long: ${chunk.length}`);
});

test("a chunk never splits a latin word in half", () => {
	const chunks = speechChunks("alpha bravo charlie delta echo foxtrot golf hotel india", 20);
	for (const chunk of chunks) {
		assert.ok(chunk.length <= 20);
		for (const word of chunk.split(" ")) {
			assert.ok(["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"].includes(word), `broken word: ${word}`);
		}
	}
});

test("an empty document yields no chunks", () => {
	assert.deepEqual(speechChunks("", 200), []);
	assert.deepEqual(speechChunks("   \n\n  ", 200), []);
});

test("a sentence that mixes prose and a formula is ONE request", () => {
	// Splitting per segment made the voice say "提取" and "：" as their own
	// utterances; a fragment belongs to the sentence it sits in.
	assert.deepEqual(
		speechChunks("提取 $a = 1$：", 200, { math: "read", mathLocale: "zh" }),
		["提取 诶等于一："],
	);
	assert.deepEqual(
		speechChunks("对称轴是 $x = 1$ 的那条直线。", 200, { math: "read", mathLocale: "zh" }),
		["对称轴是 艾克斯等于一 的那条直线。"],
	);
});

test("a fragment is only glued while the request stays under the limit", () => {
	const long = "很长的句子".repeat(20) + "$x = 1$";
	const chunks = speechChunks(long, 40, { math: "read", mathLocale: "zh" });
	for (const chunk of chunks) assert.ok(chunk.length <= 40, `chunk too long: ${chunk.length}`);
	assert.ok(chunks.length > 1);
});
