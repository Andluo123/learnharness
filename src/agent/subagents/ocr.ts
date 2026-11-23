/**
 * Offline OCR for scanned (image-only) PDF pages — RapidOCR / PP-OCRv6,
 * backed by ONNX Runtime, runs entirely in-process with no network or API key.
 *
 * Design (owner ruling 2026-11): OCR lives in the CORE, not a plugin —
 * plugin agents are prober/teacher/practice only and createPdfTools() has no
 * plugin hook, so a plugin cannot serve the pdf-reader or the graph importer.
 * The model files ship with the desktop app via extraResources and are found
 * through RAPIDOCR_MODEL_DIR; in dev the library's own cache is used.
 *
 * Page rasterization reuses the exact same native renderer as pdf_render
 * (pdfjs + @napi-rs/canvas, via getHeadless()). The recognized lines are
 * rejoined top-to-bottom into plain Markdown text that can be searched and
 * fed back into the extraction pipeline.
 *
 * Test seam: recognizePages() accepts an injected RecognizePages function;
 * unit tests inject a fake and never load the ONNX model.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as fsp from "node:fs/promises";
import { getHeadless, type HeadlessApi } from "./headless.ts";

/** A page and the OCR text produced for it. */
export interface OcrPageResult {
  page: number;
  text: string;
  /** True when the recognizer threw or returned no usable text. */
  failed: boolean;
}

export interface OcrOptions {
  /** Render DPI — 200 default (fine print; matches the PoC's accuracy). */
  dpi?: number;
  /** Injected renderer (tests); production uses getHeadless(). */
  headless?: HeadlessApi;
  /** Injected recognizer (tests); production uses the RapidOCR singleton. */
  recognize?: (png: Buffer) => Promise<string>;
  /** Per-page abort checkpoint (throws on abort). */
  signal?: AbortSignal;
}

/** Default OCR render DPI — higher than pdf_render's 150 for small print. */
export const OCR_DPI = 200;

/** Resolve the model directory. The packaged app points RAPIDOCR_MODEL_DIR at
 *  its bundled resources; dev falls back to the library cache (auto-download
 *  on first use). Returning undefined lets rapidocr-node pick its cache. */
export function ocrModelDirectory(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const dir = env.RAPIDOCR_MODEL_DIR;
  return dir && fs.existsSync(dir) ? path.resolve(dir) : undefined;
}

/** Lazily-created, process-wide RapidOCR instance. Model loading is heavy
 *  (~30 MB weights + native sessions), so it must be reused across pages
 *  and across requests. */
let recognizerPromise: Promise<(png: Buffer) => Promise<string>> | null = null;

async function defaultRecognizer(): Promise<(png: Buffer) => Promise<string>> {
  const { RapidOCR } = await import("rapidocr-node");
  const modelDirectory = ocrModelDirectory();
  const engine = await RapidOCR.create(modelDirectory ? { modelDirectory } : undefined);
  return async (png: Buffer) => {
    const result = await engine.recognize(png);
    // Full OCR results carry a layout-aware Markdown renderer; prefer it.
    // Other result variants (detection-only/empty) expose only lines[] — join
    // those top-to-bottom as a fallback.
    if (result.type === "ocr") {
      const markdown = result.toMarkdown();
      if (markdown && markdown.trim()) return markdown;
    }
    return result.lines.map((line) => line.text).filter(Boolean).join("\n");
  };
}

/** Recognize the given 1-indexed pages of a PDF, returning one result per page.
 *  Failures are captured per page (failed: true) so one bad page never kills
 *  the whole job — the caller decides whether to skip or report them. */
export async function recognizePdfPages(
  pdfPath: string,
  pages: readonly number[],
  options: OcrOptions = {},
): Promise<OcrPageResult[]> {
  if (pages.length === 0) return [];
  const dpi = options.dpi ?? OCR_DPI;
  const renderer = options.headless ?? getHeadless();
  const recognize = options.recognize ?? await (recognizerPromise ??= defaultRecognizer());

  const rendered = await renderer.renderPdfPages(pdfPath, [...pages], { dpi });
  const out: OcrPageResult[] = [];
  for (const { page, png } of rendered) {
    options.signal?.throwIfAborted();
    try {
      const text = (await recognize(png)).trim();
      out.push({ page, text, failed: text.length === 0 });
    } catch (error) {
      out.push({ page, text: "", failed: true });
      // Surface the error to the caller's activity log without throwing: the
      // per-page failure is already recorded above.
      void error;
    }
  }
  return out;
}

/** OCR specific pages of an in-memory PDF (graph import / plugin upload).
 *  Writes bytes to a temp file because the native renderer reads by path; the
 *  file is always removed in finally. */
export async function recognizePdfBytes(
  bytes: Uint8Array,
  pages: readonly number[],
  options: OcrOptions = {},
): Promise<OcrPageResult[]> {
  if (ocrOverride.current) return ocrOverride.current(bytes, pages, options);
  if (pages.length === 0) return [];
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-ocr-"));
  const file = path.join(dir, "scan.pdf");
  try {
    await fsp.writeFile(file, bytes);
    return await recognizePdfPages(file, pages, options);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Test seam: replace the whole byte-level OCR function process-wide (tests
 *  inject a fake; production leaves this null). Mirrors extraction.importNotes. */
export const ocrOverride: { current?: typeof recognizePdfBytes } = {};

/** Test seam: reset the cached recognizer (e.g. after changing the model dir). */
export function resetOcrRecognizer(): void {
  recognizerPromise = null;
}
