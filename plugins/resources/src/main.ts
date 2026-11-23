/**
 * Resources: a right-hand file explorer for LearnHarness.
 *
 * Registers a dock panel (the persistent right column) plus the actions that open
 * it. The panel browses the WHOLE local filesystem (owner decision: no authorized
 * folder list), previews the usual study formats, and can hand any file path to
 * the session composer.
 *
 * Formats: text/Markdown/code render as text, images inline, PDF through the
 * browser's own viewer (a blob URL, no bundled renderer). Office documents are
 * metadata-only in v0.1 -- the panel offers the handoff instead of a broken
 * preview.
 */

import type {
	PluginDockCapabilities,
	PluginFrontendContext,
} from "learnharness-plugin-api";

type Entry = { name: string; kind: string; size: number };
type ListResult = { ok: boolean; error?: string; path?: string; name?: string; entries?: Entry[] };
type OfficeSheet = { name: string; rows: string[][]; truncated: boolean };
type OfficeSlide = { index: number; lines: string[] };
type ReadResult = {
	ok: boolean; error?: string; kind?: string; name?: string; size?: string;
	content?: string; data?: string; mime?: string; bytes?: number; truncated?: boolean;
	/** Office conversion payload (backend/routes office files through mammoth,
	 *  SheetJS or the pptx text extractor). */
	format?: "docx" | "xlsx" | "pptx";
	html?: string;
	sheets?: OfficeSheet[];
	slides?: OfficeSlide[];
	notes?: string[];
};
type Root = { label: string; path: string };
type RootsResult = { ok: boolean; roots?: Root[]; home?: string; error?: string };

/** Words the panel needs. The host does not translate plugin copy, so the panel
 * picks a catalog from the live document language. */
const COPY = {
	en: {
		name: "Resources",
		title: "Resources",
		start: "This PC",
		refresh: "Refresh",
		up: "Up",
		empty: "This folder is empty.",
		unsupported: "This folder cannot be read.",
		unsupportedHint: "Windows protects this location.",
		rootsLabel: "Drives",
		readFailed: "This file could not be previewed.",
		loading: "Loading…",
		items: (n: number) => n + (n === 1 ? " item" : " items"),
		hand: "Hand to agent",
		handed: "Path added to the composer.",
		handFailed: "The composer is not available on this page.",
		back: "Back",
		truncated: "Preview truncated to the first 2 MB.",
		officeHint: "Office documents are not previewed yet. Use Hand to agent to have the lesson read it.",
		legacyOffice: "This is the older binary Office format (.doc/.xls/.ppt). Save it as .docx/.xlsx/.pptx to preview it here.",
		officeFailed: "This document could not be converted for preview.",
		sheet: "Sheet",
		slide: "Slide",
		truncatedSheet: "Preview trimmed to the first 2000 rows / 100 columns.",
		officeNotes: "Conversion notes",
		otherHint: "This format has no preview yet. Use Hand to agent.",
	},
	"zh-CN": {
		name: "资源管理器",
		title: "资源管理器",
		start: "此电脑",
		refresh: "刷新",
		up: "上一级",
		empty: "这个文件夹是空的。",
		unsupported: "无法读取这个文件夹。",
		unsupportedHint: "系统保护了此位置。",
		rootsLabel: "驱动器",
		readFailed: "无法预览这个文件。",
		loading: "加载中…",
		items: (n: number) => n + " 项",
		hand: "交给代理",
		handed: "路径已插入输入框。",
		handFailed: "当前页面没有可用的输入框。",
		back: "返回",
		truncated: "预览已截断为前 2 MB。",
		officeHint: "暂不支持 Office 预览。可用「交给代理」让课程读取它。",
		legacyOffice: "这是旧的二进制 Office 格式（.doc/.xls/.ppt）。另存为 .docx/.xlsx/.pptx 即可在此预览。",
		officeFailed: "无法将该文档转换为预览。",
		sheet: "工作表",
		slide: "幻灯片",
		truncatedSheet: "预览已裁剪为前 2000 行 / 100 列。",
		officeNotes: "转换提示",
		otherHint: "该格式暂不支持预览。可用「交给代理」。",
		forget: "移除此文件夹",
	},
};
type Copy = typeof COPY.en;

function copyFor(): Copy {
	const lang = typeof document !== "undefined" ? document.documentElement.lang : "en";
	return lang && lang.toLowerCase().startsWith("zh") ? COPY["zh-CN"] : COPY.en;
}

let context: PluginFrontendContext | null = null;

const FOLDER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/></svg>';

export async function activate(host: PluginFrontendContext): Promise<() => void> {
	context = host;

	const disposers = [
		host.registerDock({
			id: "resources",
			name: copyFor().name,
			icon: FOLDER_ICON,
			mount: (container, signal, capabilities) => mountPanel(container, signal, capabilities),
		}),
		host.registerAction({
			id: "open-resources",
			name: copyFor().name,
			icon: FOLDER_ICON,
			run: () => { host.app.openDock("resources"); },
		}),
		host.placeAction({ id: "resources-sidebar", actionId: "open-resources", location: "sidebar" }),
		host.placeAction({ id: "resources-topbar", actionId: "open-resources", location: "top-bar", sessions: ["teaching", "practice"] }),
	];

	return () => { for (const dispose of disposers.reverse()) dispose(); context = null; };
}

/** Join a directory and a child name with the separator the path already uses. */
function join(dir: string, name: string): string {
	const separator = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
	return dir.endsWith(separator) ? dir + name : dir + separator + name;
}

function parentOf(dir: string): string | undefined {
	const normalized = dir.replace(/[\\/]+$/, "");
	const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
	if (index <= 0) return undefined;
	const parent = normalized.slice(0, index);
	return /^[A-Za-z]:$/.test(parent) ? parent + "\\" : parent;
}

export function mountPanel(container: HTMLElement, signal: AbortSignal, capabilities: PluginDockCapabilities): () => void {
	const copy = copyFor();
	const root = document.createElement("div");
	root.className = "lh-resources";
	root.setAttribute("data-testid", "resources-panel");

	const header = document.createElement("div");
	header.className = "lh-resources-header";

	// "This PC": return to the drive list. There is no folder picker any more —
	// everything on the machine is browsable, so a root view replaces it.
	const rootsButton = document.createElement("button");
	rootsButton.type = "button";
	rootsButton.className = "lh-resources-button";
	rootsButton.dataset.testid = "resources-roots";
	rootsButton.textContent = copy.start;

	const refreshButton = document.createElement("button");
	refreshButton.type = "button";
	refreshButton.className = "lh-resources-button lh-resources-icon-button";
	refreshButton.textContent = "↻";
	refreshButton.title = copy.refresh;
	refreshButton.setAttribute("aria-label", copy.refresh);

	const upButton = document.createElement("button");
	upButton.type = "button";
	upButton.className = "lh-resources-button lh-resources-icon-button";
	upButton.textContent = "↑";
	upButton.title = copy.up;
	upButton.setAttribute("aria-label", copy.up);

	// Breadcrumbs: every ancestor is a button, so the
	// learner can jump back several levels in one click, including to the drive
	// root itself.
	const crumbs = document.createElement("nav");
	crumbs.className = "lh-resources-crumbs";
	crumbs.setAttribute("data-testid", "resources-path");
	crumbs.setAttribute("aria-label", "path");

	// Breadcrumb first, then the controls pushed to the right edge.
	header.append(crumbs, upButton, refreshButton, rootsButton);

	const body = document.createElement("div");
	body.className = "lh-resources-body";
	body.setAttribute("data-testid", "resources-body");

	const status = document.createElement("div");
	status.className = "lh-resources-status";
	status.setAttribute("role", "status");

	root.append(header, body, status);
	container.append(root);

	let currentDir = "";
	let roots: Root[] = [];
	let entries: Entry[] = [];
	let previewUrl: string | null = null;
	let disposed = false;
	const alive = () => !disposed && !signal.aborted;

	function releasePreview(): void {
		if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
	}

	function say(text: string): void { status.textContent = text; }

	function clear(node: HTMLElement): void { node.replaceChildren(); }

	/** Split an absolute path into clickable ancestors plus the current leaf.
	 *  Every segment is navigable now that nothing is off-limits: on Windows the
	 *  drive ("C:\") is itself a folder you can return to, and on POSIX "/" is. */
	function crumbsFor(dir: string): Array<{ label: string; path: string | null }> {
		if (!dir) return [];
		const drive = /^[A-Za-z]:/.exec(dir);
		const separators = /[\\/]/;
		const parts = dir.split(separators).filter(Boolean);
		const segments: Array<{ label: string; path: string | null }> = [];
		if (drive) {
			const rest = parts.slice(1);
			let accumulated = drive[0] + "\\";
			// The drive root is clickable: it is where "browse the whole disk" starts.
			segments.push({ label: drive[0], path: accumulated });
			for (const part of rest) {
				accumulated = accumulated.endsWith("\\") ? accumulated + part : accumulated + "\\" + part;
				segments.push({ label: part, path: accumulated });
			}
		} else {
			let accumulated = "";
			segments.push({ label: "/", path: "/" });
			for (const part of parts) {
				accumulated += "/" + part;
				segments.push({ label: part, path: accumulated });
			}
		}
		return segments;
	}

	function renderCrumbs(dir: string): void {
		clear(crumbs);
		const segments = crumbsFor(dir);
		segments.forEach((segment, index) => {
			const clickable = segment.path !== null;
			if (index > 0) {
				const separator = document.createElement("span");
				separator.className = "lh-resources-crumb-separator";
				separator.setAttribute("aria-hidden", "true");
				separator.textContent = "›";
				crumbs.append(separator);
			}
			if (!clickable) {
				const label = document.createElement("span");
				label.className = "lh-resources-crumb lh-resources-crumb-static";
				label.textContent = segment.label;
				crumbs.append(label);
				return;
			}
			const isLeaf = index === segments.length - 1;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "lh-resources-crumb" + (isLeaf ? " lh-resources-crumb-current" : "");
			button.dataset.testid = "resources-crumb";
			button.textContent = segment.label;
			button.title = segment.path!;
			if (isLeaf) button.setAttribute("aria-current", "page");
			button.onclick = () => { if (!isLeaf) void openDir(segment.path!); };
			crumbs.append(button);
		});
	}

	function hint(text: string): HTMLElement {
		const paragraph = document.createElement("p");
		paragraph.className = "lh-resources-hint";
		paragraph.textContent = text;
		return paragraph;
	}

	async function call<T>(operation: string, input?: unknown): Promise<T | null> {
		try {
			const result = await context!.call<T>(operation, input);
			return alive() ? result : null;
		} catch (error) {
			if (alive()) say(String(error instanceof Error ? error.message : error));
			return null;
		}
	}

	/** The drive/root list. This is the panel's landing view: no folder is
	 *  "authorized" first, the whole machine is reachable. */
	async function showRoots(): Promise<void> {
		releasePreview();
		const result = await call<RootsResult>("roots");
		if (!result?.roots) return;
		roots = result.roots;
		currentDir = "";
		entries = [];
		clear(crumbs);
		const start = document.createElement("span");
		start.className = "lh-resources-crumb lh-resources-crumb-current";
		start.textContent = copy.start;
		crumbs.append(start);
		upButton.disabled = true;
		clear(body);
		const list = document.createElement("ul");
		list.className = "lh-resources-list";
		list.setAttribute("data-testid", "resources-root-list");
		for (const drive of roots) {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.className = "lh-resources-row";
			button.dataset.testid = "resources-root";
			button.dataset.kind = "dir";
			const icon = document.createElement("span");
			icon.className = "lh-resources-row-icon";
			icon.setAttribute("aria-hidden", "true");
			icon.textContent = "💽";
			const label = document.createElement("span");
			label.className = "lh-resources-row-name";
			label.textContent = drive.label;
			button.title = drive.path;
			button.append(icon, label);
			button.onclick = () => { void openDir(drive.path); };
			item.append(button);
			list.append(item);
		}
		body.append(list);
		say(copy.rootsLabel);
	}

	async function openDir(dir: string | undefined): Promise<void> {
		releasePreview();
		const result = await call<ListResult>("list", dir ? { dir } : undefined);
		if (!result) return;
		if (!result.ok) {
			clear(body);
			if (result.path) renderCrumbs(result.path);
			if (result.error && /EPERM|EACCES|access is denied|拒绝访问/i.test(result.error)) {
				body.append(hint(copy.unsupported), hint(copy.unsupportedHint));
			} else {
				body.append(hint(result.error || copy.readFailed));
			}
			upButton.disabled = true;
			say("");
			return;
		}
		currentDir = result.path ?? "";
		entries = result.entries ?? [];
		renderCrumbs(currentDir);
		upButton.disabled = !parentOf(currentDir);
		renderList();
		say(copy.items(entries.length));
	}

	function renderList(): void {
		clear(body);
		if (!entries.length) { body.append(hint(copy.empty)); return; }
		const list = document.createElement("ul");
		list.className = "lh-resources-list";
		list.setAttribute("data-testid", "resources-list");
		for (const entry of entries) {
			const item = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.className = "lh-resources-row";
			button.dataset.testid = "resources-entry";
			button.dataset.kind = entry.kind;
			const icon = document.createElement("span");
			icon.className = "lh-resources-row-icon";
			icon.setAttribute("aria-hidden", "true");
			icon.textContent = entry.kind === "dir" ? "📁" : "📄";
			const label = document.createElement("span");
			label.className = "lh-resources-row-name";
			label.textContent = entry.name;
			button.append(icon, label);
			if (entry.kind === "dir") {
				button.onclick = () => { void openDir(join(currentDir, entry.name)); };
			} else {
				const size = document.createElement("span");
				size.className = "lh-resources-row-size";
				size.textContent = formatBytes(entry.size);
				button.append(size);
				button.onclick = () => { void openFile(join(currentDir, entry.name)); };
			}
			item.append(button);
			list.append(item);
		}
		body.append(list);
	}

	/** Office preview: docx HTML, xlsx sheets as real tables, pptx slide text.
	 *  The docx HTML was sanitised in the backend (allow-listed tags, safe
	 *  hrefs only), so assigning it here cannot execute document content. */
	function renderOffice(file: ReadResult, content: HTMLElement): void {
		if (file.format === "docx" && file.html !== undefined) {
			const article = document.createElement("article");
			article.className = "lh-resources-docx";
			article.dataset.testid = "resources-docx";
			article.innerHTML = file.html;
			content.append(article);
		} else if (file.format === "xlsx" && file.sheets) {
			for (const sheet of file.sheets) {
				const section = document.createElement("section");
				section.className = "lh-resources-sheet";
				section.dataset.testid = "resources-sheet";
				if (file.sheets.length > 1) {
					const caption = document.createElement("h4");
					caption.className = "lh-resources-sheet-name";
					caption.textContent = copy.sheet + ": " + sheet.name;
					section.append(caption);
				}
				const table = document.createElement("table");
				table.className = "lh-resources-table";
				for (const row of sheet.rows) {
					const tr = document.createElement("tr");
					for (const cell of row) {
						const td = document.createElement("td");
						td.textContent = cell;
						tr.append(td);
					}
					if (tr.childElementCount) table.append(tr);
				}
				section.append(table);
				if (sheet.truncated) section.append(hint(copy.truncatedSheet));
				content.append(section);
			}
		} else if (file.format === "pptx" && file.slides) {
			for (const slide of file.slides) {
				const section = document.createElement("section");
				section.className = "lh-resources-slide";
				section.dataset.testid = "resources-slide";
				const heading = document.createElement("h4");
				heading.className = "lh-resources-slide-name";
				heading.textContent = copy.slide + " " + slide.index;
				section.append(heading);
				if (!slide.lines.length) section.append(hint(copy.officeFailed));
				else for (const line of slide.lines) {
					const paragraph = document.createElement("p");
					paragraph.className = "lh-resources-slide-line";
					paragraph.textContent = line;
					section.append(paragraph);
				}
				content.append(section);
			}
		} else {
			content.append(hint(copy.officeFailed));
			return;
		}
		if (file.notes && file.notes.length) {
			const notes = document.createElement("div");
			notes.className = "lh-resources-office-notes";
			notes.title = copy.officeNotes;
			for (const note of file.notes.slice(0, 5)) {
				const line = document.createElement("p");
				line.textContent = note;
				notes.append(line);
			}
			content.append(notes);
		}
	}
	async function openFile(path: string): Promise<void> {
		releasePreview();
		clear(body);
		body.append(hint(copy.loading));
		const result = await call<ReadResult>("read", { path });
		if (!result) return;
		if (!result.ok) {
			clear(body);
			body.append(hint(result.error === "legacy-office" ? copy.legacyOffice : (result.error || copy.readFailed)));
			return;
		}
		renderPreview(result, path);
	}

	function renderPreview(file: ReadResult, path: string): void {
		clear(body);
		const card = document.createElement("div");
		card.className = "lh-resources-preview";
		card.setAttribute("data-testid", "resources-preview");

		const actions = document.createElement("div");
		actions.className = "lh-resources-preview-actions";

		const back = document.createElement("button");
		back.type = "button";
		back.className = "lh-resources-button";
		back.textContent = "← " + copy.back;
		back.onclick = () => { releasePreview(); if (entries.length || currentDir) renderList(); else void showRoots(); };

		const hand = document.createElement("button");
		hand.type = "button";
		hand.className = "lh-resources-button lh-resources-hand";
		hand.dataset.testid = "resources-hand";
		hand.textContent = copy.hand;
		hand.onclick = () => { say(capabilities.insertComposerText(path) ? copy.handed : copy.handFailed); };

		const title = document.createElement("div");
		title.className = "lh-resources-preview-title";
		title.textContent = file.name ?? "";
		title.title = path;

		actions.append(back, hand);

		const content = document.createElement("div");
		content.className = "lh-resources-preview-content";

		if (file.kind === "image" && file.data) {
			const image = document.createElement("img");
			image.className = "lh-resources-image";
			image.alt = file.name ?? "";
			image.src = "data:" + (file.mime || "image/png") + ";base64," + file.data;
			content.append(image);
		} else if (file.kind === "pdf" && file.data) {
			// The browser's own viewer: no bundled renderer, real page controls.
			// Decoding happens in chunks so a 200 MB textbook does not block the
			// main thread while it converts.
			const placeholder = hint(copy.loading);
			content.append(placeholder);
			void base64ToBlob(file.data, file.mime || "application/pdf").then(blob => {
				if (!alive() || !blob) return;
				placeholder.remove();
				previewUrl = URL.createObjectURL(blob);
				const frame = document.createElement("iframe");
				frame.className = "lh-resources-frame";
				frame.title = file.name ?? copy.title;
				frame.src = previewUrl;
				content.append(frame);
			});
		} else if (file.kind === "text" || file.kind === "code") {
			const pre = document.createElement("pre");
			pre.className = "lh-resources-text";
			pre.textContent = file.content ?? "";
			content.append(pre);
			if (file.truncated) content.append(hint(copy.truncated));
		} else if (file.kind === "office") {
			renderOffice(file, content);
		} else {
			content.append(hint(copy.otherHint));
		}
		const meta = document.createElement("div");
		meta.className = "lh-resources-preview-meta";
		meta.textContent = [file.size, file.kind].filter(Boolean).join(" · ");

		card.append(title, actions, content, meta);
		body.append(card);
	}

	rootsButton.onclick = () => { void showRoots(); };

	refreshButton.onclick = () => { void (currentDir ? openDir(currentDir) : showRoots()); };

	upButton.onclick = () => {
		const parent = parentOf(currentDir);
		if (parent) void openDir(parent);
	};

	const onAbort = () => { disposed = true; releasePreview(); root.remove(); };
	signal.addEventListener("abort", onAbort, { once: true });

	void showRoots();

	return () => {
		disposed = true;
		signal.removeEventListener("abort", onAbort);
		releasePreview();
		root.remove();
	};
}

/** Convert base64 to a Blob without monopolising the main thread.
 *
 *  atob() plus a byte loop over a 200 MB payload blocks for seconds. Decoding in
 *  bounded chunks and yielding between them keeps the panel responsive (the file
 *  still takes as long; the UI just stays alive), which is what "no size cap"
 *  has to mean for the guard to be safely removed. */
async function base64ToBlob(base64: string, mime: string): Promise<Blob | null> {
	const CHUNK = 1024 * 1024;
	const parts: BlobPart[] = [];
	const total = base64.length;
	for (let offset = 0; offset < total; offset += CHUNK) {
		const slice = base64.slice(offset, Math.min(offset + CHUNK, total));
		let binary: string;
		try { binary = atob(slice); }
		catch { return null; }
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		parts.push(bytes);
		await new Promise<void>(resolve => { setTimeout(resolve, 0); });
	}
	if (!parts.length) return null;
	return new Blob(parts, { type: mime });
}

function formatBytes(size: number): string {
	if (!Number.isFinite(size) || size <= 0) return "";
	if (size < 1024) return size + " B";
	if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
	if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + " MB";
	return (size / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
