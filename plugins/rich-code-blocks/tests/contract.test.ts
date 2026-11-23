import test from "node:test";
import assert from "node:assert/strict";
import { CACHE_BYTES, CACHE_ENTRIES, DEFAULT_SETTINGS, INSTRUCTIONS, SOURCE_LIMITS, SVG_LIMIT, assertTikzCharacters, checkSource, checkSvgSize, normalizeTikzSource, parseChange, parseSettings } from "../src/contract.ts";
import { RenderCache } from "../src/render.ts";

test("strict versioned settings/change contracts retain false and reject unknown or malformed fields", () => {
  assert.deepEqual(parseSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  for (const invalid of [null, [], {}, { ...DEFAULT_SETTINGS, version: 2 }, { ...DEFAULT_SETTINGS, revision: -1 }, { ...DEFAULT_SETTINGS, revision: 0.5 }, { ...DEFAULT_SETTINGS, musicalNotation: "false" }, { ...DEFAULT_SETTINGS, extra: true }]) assert.throws(() => parseSettings(invalid));
  assert.deepEqual(parseChange({ family: "technicalDiagrams", enabled: false }), { family: "technicalDiagrams", enabled: false });
  for (const invalid of [null, {}, { family: "tikz", enabled: true }, { family: "musicalNotation", enabled: 0 }, { family: "musicalNotation", enabled: true, extra: false }]) assert.throws(() => parseChange(invalid));
});

test("v1 settings tolerate and discard obsolete inkColor without changing revisions or family choices", () => {
  const settings = { ...DEFAULT_SETTINGS, revision: 4, chemicalStructures: true, technicalDiagrams: true };
  assert.deepEqual(parseSettings(settings), settings);
  for (const inkColor of ["white", "black", null, undefined, true, "auto", "", 0]) {
    assert.deepEqual(parseSettings({ ...settings, inkColor }), settings);
  }
  assert.equal("inkColor" in DEFAULT_SETTINGS, false);
  assert.throws(() => parseSettings({ ...settings, inkColour: "black" }), /Unknown/);
});

test("technical-diagram instructions cover the observed TeX authoring failures", () => {
  const instructions = INSTRUCTIONS.technicalDiagrams;
  assert.match(instructions, /one self-contained TeX document/);
  assert.match(instructions, /supplies the standalone document class: never include \\documentclass or \\documentstyle/);
  assert.match(instructions, /package and library declarations before \\begin\{document\}, then the diagram, then \\end\{document\}/);
  for (const name of ["tikz", "circuitikz", "tikz-cd", "pgfplots", "amsmath"]) {
    assert.ok(instructions.includes(`\\usepackage{${name}}`), `Missing explicit package declaration: ${name}`);
  }
  assert.match(instructions, /\\text\{\.\.\.\} or aligned equations, also load \\usepackage\{amsmath\}/);
  assert.match(instructions, /\\usetikzlibrary in the preamble/);
  assert.match(instructions, /never rely on declarations from another block/);
  assert.ok(instructions.includes("Do not wrap the diagram in \\[...\\], $$...$$, or an equation environment."));
  assert.match(instructions, /tikzcd cells already use math mode/);
  assert.match(instructions, /bundled PGFPlots version is 1\.16/);
  assert.ok(instructions.includes("\\pgfplotsset{compat=1.16}"));
  assert.match(instructions, /do not request 1\.18 or another newer version/);
  assert.match(instructions, /bundled TeX fonts cover ASCII only/);
  assert.ok(instructions.includes("$50^\\circ$ not 50°"));
  assert.match(instructions, /% comments are ignored/);
});

test("UTF-8 source/output bounds are enforced without trimming valid payloads", () => {
  checkSource("smiles", "C".repeat(SOURCE_LIMITS.smiles));
  assert.throws(() => checkSource("smiles", "C".repeat(SOURCE_LIMITS.smiles + 1)));
  assert.throws(() => checkSource("smiles", "é".repeat(SOURCE_LIMITS.smiles)));
  assert.throws(() => checkSource("abc", " \n\t"));
  checkSvgSize("x".repeat(SVG_LIMIT)); assert.throws(() => checkSvgSize("x".repeat(SVG_LIMIT + 1)));
});

test("volatile LRU bounds include keys, recency, replacement and clear", () => {
  const cache = new RenderCache();
  for (let i = 0; i < CACHE_ENTRIES; i++) cache.set(String(i), "svg");
  assert.equal(cache.get("0"), "svg"); cache.set("new", "value");
  assert.equal(cache.get("1"), undefined); assert.equal(cache.get("0"), "svg");
  cache.set("new", "replacement"); assert.equal(cache.get("new"), "replacement");
  cache.set("big", "x".repeat(CACHE_BYTES - 3));
  assert.equal(cache.get("0"), undefined); assert.equal(cache.get("big")?.length, CACHE_BYTES - 3);
  cache.set("oversize", "x".repeat(CACHE_BYTES)); assert.equal(cache.get("oversize"), undefined);
  cache.clear(); assert.equal(cache.get("big"), undefined);
});

/** The engine's preloaded format already supplies \\documentclass{standalone}.
 *  A model copy of that line aborts compilation with "Two \\documentclass
 *  commands" and the block renders as raw code — the failure this normalizer
 *  removes. Keep the surrounding document body intact. */
test("tikz sources tolerate an engine-supplied documentclass line", () => {
  const body = "\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n\\end{document}";
  assert.equal(normalizeTikzSource(`\\documentclass{standalone}\n${body}`), body);
  assert.equal(normalizeTikzSource(`\\documentclass[border=2pt]{standalone}\n${body}`), body);
  assert.equal(normalizeTikzSource(`\\documentstyle{standalone}\n${body}`), body);
  assert.equal(normalizeTikzSource(`\\documentclass{article}\n\\documentclass{standalone}\n${body}`), body);
  // Idempotent, and a clean source is untouched.
  assert.equal(normalizeTikzSource(body), body);
  assert.equal(normalizeTikzSource(normalizeTikzSource(body)), body);
});

/** The bundled Computer Modern fonts are ASCII-only. A real answer labelled an
 *  angle "$50°$" and the engine aborted (or stalled on the missing tcrm1000
 *  metric) instead of drawing. Catch the character before TeX starts, name the
 *  TeX spelling, and leave % comments alone because they never reach TeX. */
test("tikz sources reject characters the bundled ASCII fonts cannot typeset", () => {
  const fail = (source: string): string => {
    assert.throws(() => checkSource("tikz", source));
    try { checkSource("tikz", source); } catch (error) { return (error as Error).message; }
    throw new Error("unreachable");
  };
  const head = "\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\n";
  const tail = "\n\\end{tikzpicture}\n\\end{document}";
  const degree = fail(`${head}\\node at (0,0) {$50°$};${tail}`);
  assert.match(degree, /TikZ source line 4, column 20/);
  assert.ok(degree.includes('"°"') && degree.includes("U+00B0"));
  assert.ok(degree.includes("$^\\circ$"), degree);
  assert.ok(degree.includes("bundled TeX fonts cannot typeset"));
  // No suggestion is invented for characters outside the common-symbol set.
  const chinese = fail(`${head}\\node at (0,0) {中文};${tail}`);
  assert.ok(chinese.includes("Use ASCII and TeX commands instead."), chinese);
  const emoji = fail(`${head}\\node at (0,0) {😀};${tail}`);
  assert.ok(emoji.includes("U+1F600"), emoji);
  // \% is a literal percent, so what follows it is still TeX input.
  assert.ok(fail(`${head}\\node {50\\% °};${tail}`).includes('"°"'));

  // Comments, ASCII layout and a leading BOM stay accepted.
  assert.doesNotThrow(() => assertTikzCharacters("% 这是一个三角形"));
  assert.doesNotThrow(() => assertTikzCharacters("\\draw (0,0)--(1,1); % 50° here"));
  assert.doesNotThrow(() => checkSource("tikz", "\uFEFF\\usepackage{tikz}\r\n\\begin{document}\r\n\t\\draw (0,0)--(1,1);\r\n\\end{document}"));
});
