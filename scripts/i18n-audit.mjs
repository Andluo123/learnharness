/** i18n coverage audit (zh-CN wave).
 *
 *  Scans the app's presentation code for user-visible English that never
 *  went through t(). Six patterns are covered — the last two are the ones
 *  earlier sweeps kept missing:
 *
 *    1. JSX text nodes            <span>Cost</span>
 *    2. attribute literals        label="Background"
 *    3. ternary literals          cond ? "Cancel" : "Close"
 *    4. object properties         { label: "Strong" }
 *    5. module-level constants    const COPY = { title: "..." }
 *    6. pure-function returns     return cond ? "App-wide" : ...
 *
 *  Run: node scripts/i18n-audit.mjs
 *  Exit code 1 when anything is found, so it can gate CI.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules","dist",".next",".git","core-plugins","tests","docs"]);

/** TypeScript noise that looks like copy but is not. */
const NOISE = /^(Promise|RefObject|AnchorRect|PluginSubmission|Array\.from|ReturnType|Record<|HTML\w+Element)/;

/** Files whose English strings are DELIBERATE fallbacks: module-level
 *  constants and pure functions cannot call a hook, so they keep the English
 *  wording for tests and the no-hook path. The UI resolves them through
 *  abortCopy() / chatgptDisconnectCopy() / etc. */
const FALLBACK_FILES = [
	"abort-turn-dialog.tsx",
	"chatgpt-connection.tsx",
	"ai-elements\\message.tsx",
	"delete-session-dialog.tsx",
	"plugin-chrome.tsx",   // Extract<T> is a TS utility type, not copy
];

/** Font-family names are identifiers, never translated. */
/** Pure functions that RETURN English labels for tests; their call sites
 *  translate at render time (agent-section uses t(`section.${id}`)). */
const PURE_RETURN_FILES = ["agent-section.tsx"];

const FONT_NAMES = new Set([
	"Arial","CMU Serif","Courier New","Georgia","Helvetica","Helvetica Neue",
	"JetBrains Mono","Menlo","Times New Roman","Trebuchet MS","Verdana",
]);

const ATTRS = ["label","hint","placeholder","aria-label","title","alt","emptyLabel","footer","description","note"];

function looksLikeCopy(text) {
	if (FONT_NAMES.has(text)) return false;
	if (typeof text !== "string") return false;
	const s = text.trim();
	if (s.length < 3 || s.length > 200) return false;
	if (!/[A-Za-z]/.test(s)) return false;
	if (NOISE.test(s)) return false;
	if (/^(https?:|var\(|--|#[0-9a-f]{3,8}$|data-|aria-)/i.test(s)) return false;
	if (/^[a-z][a-z0-9-]*$/.test(s)) return false;          // css class / slug
	if (/^[A-Z_]+$/.test(s)) return false;                   // CONSTANT_NAME
	if (/^(true|false|null|undefined|none|auto|default|off|on)$/i.test(s)) return false;
	if (/^[\w.-]+\.(ts|tsx|js|json|css|md|png|svg)$/.test(s)) return false;
	return /\s/.test(s) || /^[A-Z][a-z]+([ -][A-Za-z]+){0,5}$/.test(s);
}

const findings = [];

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) { walk(full); continue; }
		if (!/\.tsx$/.test(entry.name)) continue;
		scanFile(full);
	}
}

function scanFile(file) {
	const lines = readFileSync(file, "utf-8").split("\n");
	lines.forEach((line, index) => {
		const src = line.trim();
		if (!src || /^(\/\/|\*|\/\*|import )/.test(src)) return;
		if (/\bt\(/.test(line)) return;                      // already translated

		const add = (kind, text) => {
			if (looksLikeCopy(text)) findings.push({ file, line: index + 1, kind, text });
		};

		// 1. JSX text nodes
		for (const m of line.matchAll(/>\s*([A-Z][^<>{}]{3,200}?)\s*</g)) add("jsx-text", m[1]);

		// 2. attribute literals
		for (const attr of ATTRS) {
			for (const m of line.matchAll(new RegExp(`\${attr}="([A-Za-z][^"]{3,200})"`, "g"))) add(attr, m[1]);
		}

		// 3. ternary literals
		for (const m of line.matchAll(/\?\s*"([A-Z][^"]{4,200})"\s*:\s*"([A-Z][^"]{4,200})"/g)) {
			add("ternary", m[1]); add("ternary", m[2]);
		}

		// 4. object properties
		for (const m of line.matchAll(/\b(label|description|title|note|hint|footer)\s*:\s*"([A-Za-z][^"]{4,200})"/g)) {
			add(`obj-${m[1]}`, m[2]);
		}

		// 5/6. bare string literal on its own line (constant / return value)
		const bare = line.match(/^\s*(?:return\s+)?[?]?\s*[:]?\s*"([A-Z][^"]{4,200})"[,;)]?\s*$/);
		if (bare) add("constant", bare[1]);
	});
}

walk(path.join(ROOT, "components"));

// Dedupe by (file, text)
const seen = new Set();
const unique = findings.filter((f) => {
	// Deliberate English fallbacks (see FALLBACK_FILES).
	if (FALLBACK_FILES.some((name) => f.file.endsWith(name))) return false;
	if (f.kind === "obj-label" && PURE_RETURN_FILES.some((name) => f.file.endsWith(name))) return false;
	const key = f.file + "|" + f.text;
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
});

if (unique.length === 0) {
	console.log("i18n audit: clean — no untranslated UI copy found.");
	process.exit(0);
}

const byFile = {};
for (const f of unique) (byFile[f.file] ||= []).push(f);
for (const [file, items] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
	console.log(`\n${path.relative(ROOT, file)}`);
	for (const item of items) console.log(`  ${item.line} [${item.kind}] ${item.text.slice(0, 100)}`);
}
console.log(`\ni18n audit: ${unique.length} untranslated string(s).`);
process.exit(1);
