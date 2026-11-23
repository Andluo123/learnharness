'use strict';
/**
 * Resources backend: browse the local filesystem and serve preview payloads.
 *
 * RPC surface (frontend calls these through ctx.call):
 *   roots()             -> { ok, roots:[{ label, path }] }  drives, or / on POSIX
 *   list(dir?)          -> { ok, path, name, entries:[{name,kind,size}] }
 *   read(path)          -> { ok, kind, name, size, content? | data? | mime? }
 *
 * SCOPE: this plugin browses the WHOLE machine by the learner's explicit choice
 * (owner decision, 2026-11-17: "browse all folders", no authorized-folder list
 * and no path jail). It runs as trusted local code in the app's own process, so
 * it can read what that process can read; there is no privilege boundary being
 * crossed here, only a UI convenience for reaching files quickly.
 *
 * What this file still does NOT do: write, delete, move or execute anything.
 * Every operation is a read. Paths are resolved before use so ".." cannot turn
 * a listed entry into something other than what it says.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/** Read at most this much of a text file: a text preview past a few megabytes
 *  is unreadable anyway, and the full file stays available through the agent. */
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
/** Binary previews are NOT capped. A scanned textbook is routinely 50-200 MB
 *  and is exactly what a learner wants to look at; refusing it on size was the
 *  wrong guard. The browser decodes the payload off the main thread (see
 *  main.ts), so a big file costs latency, not a frozen page. */
const HIDDEN = new Set(['node_modules', '.git']);

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'];
const TEXT_EXT = ['.txt', '.md', '.markdown', '.text', '.log', '.csv', '.tsv', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf'];
const CODE_EXT = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.py', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.cs', '.rb', '.php', '.swift', '.kt', '.sh', '.ps1', '.sql', '.html', '.htm', '.xml', '.vue', '.svelte'];
const OFFICE_EXT = ['.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.xlsb', '.ppt', '.pptx', '.pptm', '.odt', '.ods', '.odp', '.rtf'];

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.pdf': 'application/pdf',
};

const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

function expandHome(p) {
  const home = os.homedir();
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~' + path.sep)) return path.join(home, p.slice(2));
  return p;
}

function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/** Classify by extension. Unknown stays "other" so the UI can offer the handoff. */
function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return { kind: 'image', ext };
  if (ext === '.pdf') return { kind: 'pdf', ext };
  if (TEXT_EXT.includes(ext)) return { kind: 'text', ext };
  if (CODE_EXT.includes(ext)) return { kind: 'code', ext };
  if (OFFICE_EXT.includes(ext)) return { kind: 'office', ext };
  return { kind: 'other', ext };
}

/** Every mount point the process can see. Windows: mounted drive letters.
 *  POSIX: the filesystem root plus the user's home, which is where a learner
 *  actually starts. */
function listRoots() {
  const roots = [];
  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code++) {
      const letter = String.fromCharCode(code);
      const drive = letter + ':\\';
      try { if (fs.statSync(drive).isDirectory()) roots.push({ label: letter + ':', path: drive }); }
      catch { /* not mounted */ }
    }
  } else {
    roots.push({ label: '/', path: '/' });
  }
  const home = os.homedir();
  if (!roots.some(root => root.path === home)) roots.push({ label: '~', path: home });
  return roots;
}


/* Office documents: .docx and .xlsx are OOXML (a zip of XML parts). mammoth
 * and SheetJS handle those; .pptx has no comparable library here, so its
 * slide text is extracted directly from the zip. Every path below is
 * READ-ONLY and returns a small JSON payload for the panel. */

const MAX_OFFICE_BYTES = 64 * 1024 * 1024;
const MAX_XLSX_ROWS = 2000;
const MAX_XLSX_COLS = 100;
const MAX_PPTX_SLIDES = 300;

let mammothLib, xlsxLib;
function loadMammoth() { if (!mammothLib) mammothLib = require('mammoth'); return mammothLib; }
function loadXlsx() { if (!xlsxLib) xlsxLib = require('xlsx'); return xlsxLib; }

/** Escape text that reaches the panel. The preview assigns innerHTML, so a
 *  document must never be able to inject markup or script. */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Allow-list the tag vocabulary mammoth emits; drop every attribute except a
 *  safe href. Anything else becomes nothing. */
function sanitizeDocxHtml(html) {
  const allowed = new Set(['P','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','THEAD','TBODY','TR','TD','TH','STRONG','EM','B','I','U','BR','BLOCKQUOTE','CODE','PRE','SUP','SUB']);
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
      const tag = String(rawTag).toUpperCase();
      if (!allowed.has(tag)) return '';
      if (match.startsWith('</')) return '</' + tag.toLowerCase() + '>';
      if (tag === 'A') {
        const href = /\bhref\s*=\s*"([^"]*)"/i.exec(rawAttrs);
        const safe = href && /^(https?:|mailto:)/i.test(href[1]) ? ' href="' + escapeHtml(href[1]) + '" rel="noopener noreferrer"' : '';
        return '<a' + safe + '>';
      }
      return '<' + tag.toLowerCase() + '>';
    });
}

function convertDocx(buffer) {
  return loadMammoth().convertToHtml({ buffer }).then(result => ({
    ok: true, kind: 'office', format: 'docx',
    html: sanitizeDocxHtml(result.value || ''),
    notes: (result.messages || []).slice(0, 5).map(m => String(m.message || m)),
  }));
}

function convertXlsx(buffer) {
  const XLSX = loadXlsx();
  const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_XLSX_ROWS + 1, cellFormula: false, cellHTML: false });
  const sheets = workbook.SheetNames.slice(0, 20).map(name => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' });
    return {
      name,
      rows: rows.slice(0, MAX_XLSX_ROWS).map(row => row.slice(0, MAX_XLSX_COLS).map(cell => String(cell == null ? '' : cell))),
      truncated: rows.length > MAX_XLSX_ROWS || rows.some(row => row.length > MAX_XLSX_COLS),
    };
  });
  return { ok: true, kind: 'office', format: 'xlsx', sheets,
    notes: workbook.SheetNames.length > 20 ? ['Only the first 20 sheets are shown.'] : [] };
}

/** Pull one entry out of a zip with the platform's own inflate. */
function readZipEntry(buffer, entryName) {
  const central = 0x02014b50;
  for (let offset = 0; offset + 46 <= buffer.length; offset++) {
    if (buffer.readUInt32LE(offset) !== central) continue;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name !== entryName) { offset += 45 + nameLength + extraLength + commentLength; continue; }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + compressedSize);
    if (method === 0) return data;
    if (method === 8) return require('node:zlib').inflateRawSync(data);
    return null;
  }
  return null;
}

function convertPptx(buffer) {
  const order = readZipEntry(buffer, 'ppt/presentation.xml');
  const slideIds = [];
  if (order) for (const match of order.toString('utf8').matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)) slideIds.push(match[1]);
  const rels = readZipEntry(buffer, 'ppt/_rels/presentation.xml.rels');
  const targets = new Map();
  if (rels) for (const match of rels.toString('utf8').matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) targets.set(match[1], match[2]);
  const slides = [];
  const limit = Math.min(slideIds.length, MAX_PPTX_SLIDES);
  for (let index = 0; index < limit; index++) {
    const target = targets.get(slideIds[index]);
    if (!target) continue;
    const entry = 'ppt/' + target.replace(/^\/?ppt\//, '').replace(/^\.\.\//, '');
    const slide = readZipEntry(buffer, entry);
    if (!slide) continue;
    const lines = [];
    for (const match of slide.toString('utf8').matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)) {
      const text = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
      if (text) lines.push(text);
    }
    slides.push({ index: index + 1, lines });
  }
  return { ok: true, kind: 'office', format: 'pptx', slides,
    notes: slideIds.length > MAX_PPTX_SLIDES ? ['Only the first 300 slides are shown.'] : [] };
}

/** .doc/.xls/.ppt are the pre-2007 binary formats: refuse explicitly instead
 *  of rendering garbage. */
async function convertOffice(abs, ext) {
  if (ext === '.doc' || ext === '.xls' || ext === '.ppt') return { ok: false, error: 'legacy-office', path: abs };
  if (fs.statSync(abs).size > MAX_OFFICE_BYTES) return { ok: false, error: 'too-large', path: abs };
  const buffer = fs.readFileSync(abs);
  try {
    if (ext === '.docx' || ext === '.odt') return await convertDocx(buffer);
    if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xlsb' || ext === '.ods') return convertXlsx(buffer);
    if (ext === '.pptx' || ext === '.odp') return convertPptx(buffer);
    return { ok: false, error: 'unsupported-office', path: abs };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error), path: abs };
  }
}
function activate(ctx) {
  const alive = () => { if (ctx.signal.aborted) throw new Error('Resources is disabled.'); };

  function list(dir) {
    alive();
    const target = path.resolve(expandHome(dir || os.homedir()));
    try {
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) return fail('not-a-directory', { path: target });
      const entries = fs.readdirSync(target, { withFileTypes: true })
        .filter(entry => !entry.name.startsWith('.') && !HIDDEN.has(entry.name))
        .map(entry => {
          const full = path.join(target, entry.name);
          let size = 0;
          try { if (entry.isFile()) size = fs.statSync(full).size; } catch { /* raced away */ }
          return { name: entry.name, kind: entry.isDirectory() ? 'dir' : 'file', size };
        })
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
      return { ok: true, path: target, name: path.basename(target) || target, entries };
    } catch (error) {
      return fail(String((error && error.message) || error), { path: target });
    }
  }

  /** Whether a path can be entered, so the UI can mark unreadable entries
   *  instead of letting the learner click into an access-denied error. */
  async function read(file) {
    alive();
    if (typeof file !== 'string' || !file) return fail('invalid-path');
    const abs = path.resolve(expandHome(file));
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile()) return fail('not-a-file', { path: abs });
      const cls = classify(abs);
      const name = path.basename(abs);
      if (cls.kind === 'image' || cls.kind === 'pdf') {
        const mime = MIME[cls.ext] || (cls.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream');
        const bytes = fs.readFileSync(abs);
        return { ok: true, kind: cls.kind, name, size: fmtSize(stat.size), bytes: bytes.length, mime, data: bytes.toString('base64') };
      }
      if (cls.kind === 'office') {
        return await convertOffice(abs, cls.ext);
      }
      if (cls.kind === 'text' || cls.kind === 'code') {
        const buffer = fs.readFileSync(abs);
        const truncated = buffer.length > MAX_TEXT_BYTES;
        const slice = truncated ? buffer.subarray(0, MAX_TEXT_BYTES) : buffer;
        return { ok: true, kind: cls.kind, name, size: fmtSize(stat.size), truncated, content: slice.toString('utf8') };
      }
      return { ok: true, kind: cls.kind, name, size: fmtSize(stat.size) };
    } catch (error) {
      return fail(String((error && error.message) || error), { path: abs });
    }
  }

  ctx.handle('roots', () => { alive(); return { ok: true, roots: listRoots(), home: os.homedir() }; });
  ctx.handle('list', input => list(input && input.dir));
  ctx.handle('read', input => read(input && input.path));
}

exports.activate = activate;
