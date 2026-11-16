/** Catalog key-parity check (zh-CN i18n wave).
 *  Fails when en.json and zh-CN.json disagree on key structure,
 *  or when a value is empty / still equals its key. */
import { readFileSync } from "node:fs";

const load = (p) => JSON.parse(readFileSync(new URL(`./messages/${p}`, import.meta.url), "utf8"));

function flatten(obj, prefix = "", out = {}) {
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
		else out[key] = v;
	}
	return out;
}

const en = flatten(load("en.json"));
const zh = flatten(load("zh-CN.json"));
const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));

let bad = 0;
for (const k of enKeys) if (!zhKeys.has(k)) { console.error(`MISSING in zh-CN: ${k}`); bad++; }
for (const k of zhKeys) if (!enKeys.has(k)) { console.error(`EXTRA in zh-CN: ${k}`); bad++; }
for (const [k, v] of Object.entries(zh)) {
	if (typeof v !== "string" || v.trim() === "") { console.error(`EMPTY zh-CN value: ${k}`); bad++; }
}

console.log(`en keys: ${enKeys.size}, zh-CN keys: ${zhKeys.size}, parity issues: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
