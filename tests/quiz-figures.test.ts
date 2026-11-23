import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliveredFigures, deliveredFigureOfMessage, figureProblem, resolveQuizFigure } from "../src/core/quiz-figures.ts";
import { quizInputProblems } from "../src/core/question-core.ts";

const steer = (toolCallId: string, svg: string, snapshotId?: string) => ({
	role: "custom",
	customType: "subagent-steer",
	details: { jobId: "job_1", kind: "visual", toolCallId, result: { svg, ...(snapshotId ? { image: { path: "p", snapshotId } } : {}) } },
});

describe("quiz figures (the reference contract)", () => {
	it("extracts delivered figures keyed by tool-call id", () => {
		const figures = deliveredFigures([steer("call_a", "<svg/>"), steer("call_b", "<svg><circle/></svg>", "abc123")]);
		assert.deepEqual([...figures.keys()], ["call_a", "call_b"]);
		assert.equal(figures.get("call_a")!.svg, "<svg/>");
		assert.equal(figures.get("call_b")!.snapshotId, "abc123");
	});

	it("ignores non-visual steers, failed figures, and later messages win", () => {
		const figures = deliveredFigures([
			{ role: "custom", customType: "subagent-steer", details: { kind: "research", toolCallId: "call_r", result: {} } },
			steer("call_fail", ""),
			steer("call_a", "<svg>v1</svg>"),
			steer("call_a", "<svg>v2</svg>"),
			{ role: "user", content: [] },
		]);
		assert.deepEqual([...figures.keys()], ["call_a"]);
		assert.equal(figures.get("call_a")!.svg, "<svg>v2</svg>");
	});

	it("resolves references leniently", () => {
		const figures = deliveredFigures([steer("call_a", "<svg/>")]);
		assert.deepEqual(resolveQuizFigure("call_a", figures), { svg: "<svg/>" });
		assert.deepEqual(resolveQuizFigure(" call_a ", figures), { svg: "<svg/>" }, "a padded reference trims to the delivered id");
		assert.equal(resolveQuizFigure("call_missing", figures), null);
		assert.equal(resolveQuizFigure(undefined, figures), null);
		assert.equal(resolveQuizFigure(42, figures), null, "non-string is never a reference");
	});

	it("figureProblem names the copyable ids the way nodeIdProblem does", () => {
		assert.equal(figureProblem("call_a", ["call_a", "call_b"]), null);
		assert.match(figureProblem("call_x", ["call_a"])!, /Copy one of the delivered figure ids exactly \(call_a\)/);
		assert.match(figureProblem("call_x", [])!, /No visual job has completed yet/);
	});

	it("quizInputProblems checks references only when the seam knows the deliveries", () => {
		const input = {
			options: [{ label: "A", figure: "call_a" }, { label: "B" }],
			correctAnswer: "A",
			figure: "call_ghost",
		};
		// No figures argument: references are unchecked (probe wiring, tests).
		assert.deepEqual(quizInputProblems(input), []);
		// With the delivered list: both bad references report, good ones pass.
		const problems = quizInputProblems(input, ["call_a"]);
		assert.equal(problems.length, 1);
		assert.match(problems[0]!, /figure "call_ghost"/);
		// Option references are checked too, and located.
		const optionProblems = quizInputProblems({ ...input, figure: "call_a", options: [{ label: "A", figure: "call_ghost" }, { label: "B" }] }, ["call_a"]);
		assert.equal(optionProblems.length, 1);
		assert.match(optionProblems[0]!, /options\[0\]\.figure/);
		// An empty-string reference is no reference at all.
		assert.deepEqual(quizInputProblems({ ...input, figure: "" }, ["call_a"]), []);
	});

	it("deliveredFigureOfMessage reads only successful visual steers", () => {
		assert.deepEqual(deliveredFigureOfMessage(steer("c", "<svg/>")), { svg: "<svg/>" });
		assert.equal(deliveredFigureOfMessage({ role: "custom", customType: "plan-block", details: {} }), null);
		assert.equal(deliveredFigureOfMessage(null), null);
	});
});
