export const FAMILIES = ["chemicalStructures", "musicalNotation", "technicalDiagrams"] as const;
export type Family = typeof FAMILIES[number];
export type Language = "smiles" | "abc" | "tikz";
export interface Settings {
  version: 1;
  revision: number;
  chemicalStructures: boolean;
  musicalNotation: boolean;
  technicalDiagrams: boolean;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, revision: 0, chemicalStructures: false, musicalNotation: false, technicalDiagrams: false,
});
export const LANGUAGES: Record<Family, Language> = {
  chemicalStructures: "smiles", musicalNotation: "abc", technicalDiagrams: "tikz",
};
export const LABELS: Record<Family, string> = {
  chemicalStructures: "Chemical structures", musicalNotation: "Musical notation", technicalDiagrams: "Technical diagrams",
};
/** Localized family names (the settings page renders them as row labels). */
export function familyLabel(family: Family, t: (text: string) => string): string {
  return t(LABELS[family]);
}

export const INSTRUCTIONS: Record<Family, string> = {
  chemicalStructures: "For chemical structures, use a smiles fenced code block containing one SMILES molecule. Write explanations outside the block; do not author raw SVG.",
  musicalNotation: "For musical notation, use an abc fenced code block containing one complete ABC tune with X:, M:, L: and K: headers. It renders a static score, not audio; do not author raw SVG.",
  technicalDiagrams: [
    "For static technical diagrams, use a tikz fenced code block containing one self-contained TeX document. These blocks support physics/free-body diagrams, geometry, circuit schematics (not simulation), commutative diagrams, and analytic function plots.",
    "Every block is compiled independently. Put all required package and library declarations before \\begin{document}, then the diagram, then \\end{document}. The engine supplies the standalone document class: never include \\documentclass or \\documentstyle, and never rely on declarations from another block.",
    "Explicitly load the packages required by the diagram: \\usepackage{tikz}, \\usepackage{circuitikz}, \\usepackage{tikz-cd}, or \\usepackage{pgfplots}. For labels using \\text{...} or aligned equations, also load \\usepackage{amsmath}. Declare needed TikZ libraries with \\usetikzlibrary in the preamble.",
    "Place the tikzpicture, circuitikz, or tikzcd environment directly inside document. Do not wrap the diagram in \\[...\\], $$...$$, or an equation environment. Use $...$ for math in TikZ node labels; tikzcd cells already use math mode.",
    "The bundled TeX fonts cover ASCII only. Write labels with TeX commands, never Unicode symbols: $50^\\circ$ not 50°, $\\alpha$ not α, $\\times$ not ×, $\\pm$ not ±, $\\le$ not ≤, $\\to$ not →. A single non-ASCII character fails the whole block; only % comments are ignored.",
    "The bundled PGFPlots version is 1.16. For plots, put \\pgfplotsset{compat=1.16} in the preamble; do not request 1.18 or another newer version.",
    "Write explanations outside the block. Author notation, not raw SVG, JavaScript, or external resources.",
  ].join("\n\n"),
};
export const SOURCE_LIMITS: Record<Language, number> = { smiles: 2 * 1024, abc: 16 * 1024, tikz: 32 * 1024 };
export const SVG_LIMIT = 2 * 1024 * 1024;
export const TEX_TIMEOUT_MS = 10_000;
export const TEX_QUEUE_LIMIT = 16;
export const CACHE_ENTRIES = 32;
export const CACHE_BYTES = 8 * 1024 * 1024;

export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Rich code blocks settings.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error("Unsupported Rich code blocks settings version; the saved file has not been changed.");
  if (Object.keys(record).some(key => !["version", "revision", "inkColor", ...FAMILIES].includes(key))) throw new Error("Unknown Rich code blocks settings fields.");
  if (!Number.isSafeInteger(record.revision) || (record.revision as number) < 0 || FAMILIES.some(key => typeof record[key] !== "boolean")) {
    throw new Error("Invalid Rich code blocks settings.");
  }
  // Legacy v1 inkColor is accepted above but deliberately omitted: theme Text
  // now owns neutral ink. Reads never rewrite disk; normal saves drop the key.
  return { version: 1, revision: record.revision as number, chemicalStructures: record.chemicalStructures as boolean,
    musicalNotation: record.musicalNotation as boolean, technicalDiagrams: record.technicalDiagrams as boolean };
}

export function parseChange(value: unknown): { family: Family; enabled: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A family and boolean enabled value are required.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !FAMILIES.includes(record.family as Family) || typeof record.enabled !== "boolean") {
    throw new Error("A known family and boolean enabled value are required.");
  }
  return { family: record.family as Family, enabled: record.enabled };
}

/** The TeX engine supplies its own \documentclass{standalone} preamble, so a
 *  source that writes one fails with "Two \documentclass commands" and renders
 *  nothing. Models copy that line anyway (it is valid LaTeX everywhere else),
 *  and a silent failed render is worse than tolerating it: drop the engine-
 *  supplied declaration instead of rejecting the block. Idempotent. */
export function normalizeTikzSource(source: string): string {
	return source.replace(/^[ \t]*\\document(?:class|style)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}[ \t]*\r?\n?/gm, "");
}

/** Unicode symbols the bundled Computer Modern fonts cannot typeset, paired
 *  with the TeX spelling a model should have used instead. */
const TEX_ALTERNATIVES: Record<string, string> = {
  "°": "$^\\circ$", "±": "$\\pm$", "×": "$\\times$", "÷": "$\\div$",
  "≤": "$\\le$", "≥": "$\\ge$", "≠": "$\\ne$", "≈": "$\\approx$",
  "→": "$\\to$", "←": "$\\leftarrow$", "∞": "$\\infty$", "·": "$\\cdot$",
  "α": "$\\alpha$", "β": "$\\beta$", "γ": "$\\gamma$", "δ": "$\\delta$",
  "θ": "$\\theta$", "λ": "$\\lambda$", "μ": "$\\mu$", "π": "$\\pi$",
  "σ": "$\\sigma$", "φ": "$\\phi$", "ω": "$\\omega$", "Δ": "$\\Delta$", "Ω": "$\\Omega$",
};

/** Index of the first unescaped % (TeX comment), or the line length. */
function commentStart(line: string): number {
  for (let index = 0; index < line.length; index++) {
    if (line[index] !== "%") continue;
    let slashes = 0;
    for (let back = index - 1; back >= 0 && line[back] === "\\"; back--) slashes++;
    if (slashes % 2 === 0) return index;
  }
  return line.length;
}

/** The engine's fonts are ASCII-only. A single stray glyph ("°", "α", "→")
 *  aborts compilation, and a missing font metric can even stall the run until
 *  the timeout, so reject those characters before TeX starts and name the TeX
 *  spelling to use instead. Text after an unescaped % never reaches the
 *  engine, so comments stay allowed (models write Chinese remarks there). */
export function assertTikzCharacters(source: string): void {
  const lines = source.split(/\r?\n/);
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!;
    const end = commentStart(line);
    let column = 0;
    for (const char of line.slice(0, end)) {
      column++;
      const code = char.codePointAt(0)!;
      if (code === 9 || code === 13 || (code >= 0x20 && code <= 0x7e)) continue;
      if (row === 0 && column === 1 && code === 0xfeff) continue; // UTF-8 BOM
      const alternative = TEX_ALTERNATIVES[char];
      throw new Error(`TikZ source line ${row + 1}, column ${column} contains "${char}" `
        + `(U+${code.toString(16).toUpperCase().padStart(4, "0")}), which the bundled TeX fonts cannot typeset. `
        + (alternative ? `Write ${alternative} instead.` : "Use ASCII and TeX commands instead."));
    }
  }
}

export function checkSource(language: Language, source: string): void {
  if (new TextEncoder().encode(source).byteLength > SOURCE_LIMITS[language]) throw new Error(`${language} source exceeds the ${SOURCE_LIMITS[language] / 1024} KiB limit.`);
  if (!source.trim()) throw new Error(`Empty ${language} source.`);
  if (language === "tikz") assertTikzCharacters(source);
}

export function checkSvgSize(svg: string): void {
  if (new TextEncoder().encode(svg).byteLength > SVG_LIMIT) throw new Error("Rendered SVG exceeds the 2 MiB limit.");
}
