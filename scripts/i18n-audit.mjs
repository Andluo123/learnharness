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
const NOISE = /^(Promise|RefObject|AnchorRect|PluginSubmission|Array\.from|ReturnType|Record<|HTML\w+Element|PluginActionContext|Extract$|T \| Promise)/;

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

/** Error strings already localized at display time (i18n/error-messages.ts). */
function loadMappedErrors() {
	try {
		const src = readFileSync(path.join(ROOT, "i18n", "error-messages.ts"), "utf-8");
		return new Set([...src.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1]));
	} catch { return new Set(); }
}
const MAPPED_ERRORS = loadMappedErrors();

const findings = [];

function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) { walk(full); continue; }
		if (!/\.(tsx|ts)$/.test(entry.name)) continue;
		scanFile(full);
	}
}

/** Developer-facing throws (argument validation, registration contract)
 *  stay English on purpose — they surface in the console, not the UI. */
const DEV_ERROR = new RegExp([
	// Plugin/component API contract violations — developer-facing, never UI copy.
	"must be", "must export", "cannot", "nonempty", "requires", "require ",
	"Invalid (event|argument|extension|answer|plugin)",
	"registration", "mount must", "already registered",
	"Duplicate (plugin|question|problem|submission)",
	"reserved by the host", "placement must",
	"Unknown plugin", "globally unique",
	"used within", "Provider", "test fixture",
].join("|"), "i");

function scanFile(file) {
	const lines = readFileSync(file, "utf-8").split("\n");
	lines.forEach((line, index) => {
		const src = line.trim();
		if (!src || /^(\/\/|\*|\/\*|import )/.test(src)) return;
		if (/\bt\(/.test(line)) return;                      // already translated

		const add = (kind, text) => {
			if (!looksLikeCopy(text)) return;
			// .ts files are mostly logic: keep their developer throws in English.
			// Thrown API-contract violations are developer-facing wherever they
			// live (.ts OR .tsx) — they surface in the console, not the UI.
			if (kind === "thrown" && DEV_ERROR.test(text)) return;
			// banner (i18n/error-messages.ts). The throw site stays English by
			// design — logic layers cannot call a hook.
			if (kind === "thrown" && MAPPED_ERRORS.has(text)) return;
			findings.push({ file, line: index + 1, kind, text });
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

		// 5/6. bare string literal (constant / return value / thrown message)
		const bare = line.match(/^\s*(?:return\s+)?[?]?\s*[:]?\s*"([A-Z][^"]{4,200})"[,;)]?\s*$/);
		if (bare) add("constant", bare[1]);
		// thrown user-facing message (common in .ts logic files)
		const thrown = line.match(/throw new (?:Error|TypeError|RangeError)\(\s*["']([A-Z][^"']{8,200})["']/);
		if (thrown) add("thrown", thrown[1]);
		// a plain message string assigned to an error/state field
		const msgField = line.match(/\b(message|errorMessage|detail):\s*["']([A-Z][^"']{8,200})["']/);
		if (msgField) add("msg-" + msgField[1], msgField[2]);
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
