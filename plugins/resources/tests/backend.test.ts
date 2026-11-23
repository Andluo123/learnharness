import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const backend = require("../src/backend.cjs") as { activate(ctx: FakeCtx): void };

interface FakeCtx {
	handle(name: string, handler: (input?: unknown) => unknown): void;
	dataDirectory: string;
	signal: AbortSignal;
}

/** Capture the RPC surface the panel actually calls. */
function harness(): { call(name: string, input?: unknown): Promise<any> } {
	const handlers = new Map<string, (input?: unknown) => unknown>();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resources-test-"));
	backend.activate({ handle: (name, handler) => { handlers.set(name, handler); }, dataDirectory: dir, signal: new AbortController().signal });
	return {
		/** Backend operations may be async (office conversion reads a document),
		 *  and the host awaits them too, so the test seam must as well. */
		async call(name, input) {
			const handler = handlers.get(name);
			assert.ok(handler, `missing operation: ${name}`);
			return await handler(input);
		},
	};
}

test("roots lists at least one mount point and a home directory", async () => {
	const result = await harness().call("roots");
	assert.equal(result.ok, true);
	assert.ok(Array.isArray(result.roots) && result.roots.length > 0);
	for (const root of result.roots) {
		assert.equal(typeof root.label, "string");
		assert.ok(path.isAbsolute(root.path), `root path must be absolute: ${root.path}`);
	}
	assert.ok(typeof result.home === "string" && path.isAbsolute(result.home));
});

test("browsing is no longer confined to an allow-list (owner decision)", async () => {
	// A directory outside the plugin data directory must be listable. The old
	// build answered { ok: false, error: "not-authorized" } for exactly this.
	const outside = os.tmpdir();
	const result = await harness().call("list", { dir: outside });
	assert.equal(result.ok, true, `expected ${outside} to be listable`);
	assert.ok(Array.isArray(result.entries));
});

test("listing sorts directories before files and hides dotfiles", async () => {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "resources-sort-"));
	fs.mkdirSync(path.join(scratch, "beta-dir"));
	fs.writeFileSync(path.join(scratch, "alpha.txt"), "x");
	fs.writeFileSync(path.join(scratch, ".hidden"), "x");
	fs.mkdirSync(path.join(scratch, ".hidden-dir"));
	const result = await harness().call("list", { dir: scratch });
	assert.equal(result.ok, true);
	const names = result.entries.map((entry: { name: string }) => entry.name);
	assert.ok(!names.includes(".hidden"), "dotfiles stay hidden");
	assert.ok(!names.includes(".hidden-dir"), "dot-directories stay hidden");
	assert.equal(names[0], "beta-dir", "directories come first");
	assert.ok(names.includes("alpha.txt"));
});

test("every operation is a read: nothing writes, deletes or moves", async () => {
	const source = fs.readFileSync(new URL("../src/backend.cjs", import.meta.url), "utf8");
	const forbidden = ["writeFileSync", "unlinkSync", "rmSync", "renameSync", "mkdirSync", "rmdirSync", "chmodSync", "execSync", "spawnSync"];
	for (const name of forbidden) assert.ok(!source.includes(name), `the backend must not call ${name}`);
	for (const op of ["roots", "list", "read"]) assert.ok(source.includes(op));
});

test("read resolves .. before use, so the resolved target is what gets read", async () => {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "resources-dotdot-"));
	fs.mkdirSync(path.join(scratch, "inner"));
	fs.writeFileSync(path.join(scratch, "secret.txt"), "resolved");
	const result = await harness().call("read", { path: path.join(scratch, "inner", "..", "secret.txt") });
	assert.equal(result.ok, true);
	assert.equal(result.name, "secret.txt");
	assert.equal(result.content, "resolved");
});

test("read classifies the study formats and refuses a directory", async () => {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "resources-kinds-"));
	fs.writeFileSync(path.join(scratch, "notes.md"), "# Title");
	fs.writeFileSync(path.join(scratch, "app.ts"), "const x = 1;");
	const rpc = harness();
	assert.equal((await rpc.call("read", { path: path.join(scratch, "notes.md") })).kind, "text");
	assert.equal((await rpc.call("read", { path: path.join(scratch, "app.ts") })).kind, "code");
	const directory = await rpc.call("read", { path: scratch });
	assert.equal(directory.ok, false);
	assert.equal(directory.error, "not-a-file");
});

test("a text preview is truncated, never silently complete", async () => {
	const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "resources-big-"));
	const big = path.join(scratch, "big.txt");
	fs.writeFileSync(big, "a".repeat(3 * 1024 * 1024));
	const result = await harness().call("read", { path: big });
	assert.equal(result.ok, true);
	assert.equal(result.truncated, true);
	assert.equal(result.content.length, 2 * 1024 * 1024);
});

test("binary previews are not size-capped (the guard was removed)", async () => {
	const source = fs.readFileSync(new URL("../src/backend.cjs", import.meta.url), "utf8");
	assert.ok(!source.includes("MAX_BINARY_BYTES"), "no binary size ceiling may remain");
	assert.ok(!source.includes("tooLarge"), "no tooLarge branch may remain");
});
const OFFICE = path.join(os.tmpdir(), "resources-office-fixtures");

/** Minimal zip writer: OOXML parts are zipped deflate, and building them here
 *  keeps the office tests independent of any extra fixture dependency. */
function writeZip(target: string, entries: Array<[string, string]>): void {
	const zlib = require("node:zlib");
	const crc32 = (buf: Buffer): number => {
		let crc = 0xFFFFFFFF;
		for (let i = 0; i < buf.length; i++) {
			let c = (crc ^ (buf[i] ?? 0)) & 0xFF;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
			crc = (crc >>> 8) ^ c;
		}
		return (crc ^ 0xFFFFFFFF) >>> 0;
	};
	const locals: Buffer[] = [], centrals: Buffer[] = [];
	let offset = 0;
	for (const [name, content] of entries) {
		const nameBuf = Buffer.from(name, "utf8");
		const raw = Buffer.from(content, "utf8");
		const data = zlib.deflateRawSync(raw);
		const crc = crc32(raw);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
		local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
		central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
		locals.push(local, nameBuf, data); centrals.push(central, nameBuf);
		offset += 30 + nameBuf.length + data.length;
	}
	const centralBuf = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
	fs.writeFileSync(target, Buffer.concat([...locals, centralBuf, end]));
}

function officeFixture(): void {
	fs.mkdirSync(OFFICE, { recursive: true });
	writeZip(path.join(OFFICE, "sample.docx"), [
		["word/document.xml", "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Lesson one</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>"],
	]);
	writeZip(path.join(OFFICE, "sample.pptx"), [
		["ppt/presentation.xml", "<p:presentation xmlns:p=\"x\" xmlns:r=\"y\"><p:sldIdLst><p:sldId id=\"256\" r:id=\"rId2\"/></p:sldIdLst></p:presentation>"],
		["ppt/_rels/presentation.xml.rels", "<Relationships><Relationship Id=\"rId2\" Target=\"slides/slide1.xml\"/></Relationships>"],
		["ppt/slides/slide1.xml", "<p:sld xmlns:a=\"z\"><p:sp><p:txBody><a:p><a:r><a:t>Linear functions</a:t></a:r></a:p></p:txBody></p:sp></p:sld>"],
	]);
}

test("docx converts to HTML and a script payload cannot survive", async () => {
	officeFixture();
	const result = await harness().call("read", { path: path.join(OFFICE, "sample.docx") });
	assert.equal(result.ok, true);
	assert.equal(result.format, "docx");
	assert.match(result.html, /Lesson one/);
	assert.ok(!/<script/i.test(result.html), "script tags must not survive sanitising");
	assert.match(result.html, /&lt;script&gt;/, "the payload must be inert text");
});

test("pptx yields per-slide text in presentation order", async () => {
	officeFixture();
	const result = await harness().call("read", { path: path.join(OFFICE, "sample.pptx") });
	assert.equal(result.ok, true);
	assert.equal(result.format, "pptx");
	assert.deepEqual(result.slides, [{ index: 1, lines: ["Linear functions"] }]);
});

test("legacy binary Office formats are refused explicitly", async () => {
	fs.mkdirSync(OFFICE, { recursive: true });
	const legacy = path.join(OFFICE, "old.doc");
	fs.writeFileSync(legacy, Buffer.from([0xD0, 0xCF, 0x11, 0xE0]));
	const result = await harness().call("read", { path: legacy });
	assert.equal(result.ok, false);
	assert.equal(result.error, "legacy-office");
});
