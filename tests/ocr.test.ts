/**
 * Offline OCR core (src/agent/subagents/ocr.ts) — the injectable seams let these tests
 * exercise text joining, per-page failure isolation, abort, and the model-dir
 * env resolution WITHOUT loading ONNX weights or opening a real PDF.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ocrModelDirectory, ocrOverride, recognizePdfBytes, recognizePdfPages, resetOcrRecognizer } from "../src/agent/subagents/ocr.ts";
import type { HeadlessApi } from "../src/agent/subagents/headless.ts";
import { after } from "node:test";

after(() => { ocrOverride.current = undefined; resetOcrRecognizer(); });

function fakeHeadless(pages: number[]): HeadlessApi & { calls: { pages: number[]; dpi?: number; signal?: AbortSignal }[] } {
  const calls: { pages: number[]; dpi?: number; signal?: AbortSignal }[] = [];
  return {
    calls,
    available: () => true,
    unavailableReason: () => null,
    runDemo: async () => { throw new Error("unused"); },
    renderSvg: async () => { throw new Error("unused"); },
    renderPdfPages: async (_path, wanted, opts) => {
      calls.push({ pages: wanted, dpi: opts?.dpi, ...(opts?.signal ? { signal: opts.signal } : {}) });
      return wanted.map((page) => ({ page, png: Buffer.from([page]) }));
    },
  };
}

describe("OCR model directory resolution", () => {
  it("uses RAPIDOCR_MODEL_DIR when it points to an existing directory", () => {
    assert.equal(ocrModelDirectory({ RAPIDOCR_MODEL_DIR: "D:/learnharness/ocr-models", NODE_ENV: "test" } as NodeJS.ProcessEnv), "D:\\learnharness\\ocr-models");
  });
  it("falls back to undefined when the env dir is missing", () => {
    assert.equal(ocrModelDirectory({ RAPIDOCR_MODEL_DIR: "Z:/definitely/not/here", NODE_ENV: "test" } as NodeJS.ProcessEnv), undefined);
  });
});

describe("recognizePdfPages", () => {
  it("renders at 200 DPI and joins OCR text per page", async () => {
    const headless = fakeHeadless([2, 5]);
    const results = await recognizePdfPages("doc.pdf", [2, 5], {
      headless,
      recognize: async (png) => `text-${png[0]}`,
    });
    assert.deepEqual(results, [
      { page: 2, text: "text-2", failed: false },
      { page: 5, text: "text-5", failed: false },
    ]);
    assert.deepEqual(headless.calls, [{ pages: [2, 5], dpi: 200 }]);
  });

  it("honors an explicit DPI override", async () => {
    const headless = fakeHeadless([1]);
    await recognizePdfPages("doc.pdf", [1], { headless, dpi: 300, recognize: async () => "x" });
    assert.equal(headless.calls[0]?.dpi, 300);
  });

  it("isolates a per-page recognizer failure (failed: true, others still read)", async () => {
    const headless = fakeHeadless([1, 2, 3]);
    const results = await recognizePdfPages("doc.pdf", [1, 2, 3], {
      headless,
      recognize: async (png) => {
        if (png[0] === 2) throw new Error("model exploded on page 2");
        return "ok";
      },
    });
    assert.deepEqual(results, [
      { page: 1, text: "ok", failed: false },
      { page: 2, text: "", failed: true },
      { page: 3, text: "ok", failed: false },
    ]);
  });

  it("marks empty OCR output as failed", async () => {
    const headless = fakeHeadless([1]);
    const results = await recognizePdfPages("doc.pdf", [1], { headless, recognize: async () => "   " });
    assert.deepEqual(results, [{ page: 1, text: "", failed: true }]);
  });

  it("checks the abort signal between pages", async () => {
    const headless = fakeHeadless([1, 2]);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      recognizePdfPages("doc.pdf", [1, 2], { headless, recognize: async () => "x", signal: controller.signal }),
      /aborted/i,
    );
  });

  it("forwards the abort signal to the renderer", async () => {
    const headless = fakeHeadless([1]);
    const controller = new AbortController();
    await recognizePdfPages("doc.pdf", [1], { headless, recognize: async () => "x", signal: controller.signal });
    assert.equal(headless.calls[0]?.signal, controller.signal);
  });
  it("returns nothing for an empty page list without rendering", async () => {
    const headless = fakeHeadless([]);
    assert.deepEqual(await recognizePdfPages("doc.pdf", [], { headless, recognize: async () => "x" }), []);
    assert.equal(headless.calls.length, 0);
  });
});

describe("recognizePdfBytes", () => {
  it("is replaceable by the module-level override (test seam)", async () => {
    ocrOverride.current = async (_bytes, pages) => pages.map((page) => ({ page, text: "injected", failed: false }));
    const results = await recognizePdfBytes(new Uint8Array([1]), [7]);
    assert.deepEqual(results, [{ page: 7, text: "injected", failed: false }]);
  });
});
