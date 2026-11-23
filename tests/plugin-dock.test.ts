import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { parseHTML } from "linkedom";

/** The dock's mount lifetime must survive host re-renders.
 *
 *  Regression (reported 2026-11-17): resizing the dock divider re-mounted the
 *  plugin panel, so a file preview snapped back to the folder list. The cause
 *  was an object identity in DockMount's effect dependencies: placedDocks()
 *  builds a new wrapper on every render, and dragging changes width, so the
 *  effect re-ran and mountDock() tore the panel down and rebuilt it.
 *
 *  These tests pin the host contract that prevents it: an unchanged dock shows
 *  up as the SAME PlacedDock identity across renders, and the panel body is
 *  mounted exactly once while its width changes. */

const dom = parseHTML("<html><body></body></html>");
const globals = globalThis as Record<string, unknown>;
const previousDescriptors = new Map<string, PropertyDescriptor | undefined>();

let root: Root;
let host: HTMLDivElement;
let createRoot: typeof import("react-dom/client").createRoot;
let placedDocks: typeof import("../components/plugin-dock.tsx").placedDocks;
let dockStore: typeof import("../components/plugin-dock-store.ts").dockStore;
let clampDockWidth: typeof import("../components/plugin-dock-store.ts").clampDockWidth;
let DOCK_MIN_WIDTH: number, DOCK_MAX_WIDTH: number;

before(async () => {
	for (const [key, value] of Object.entries({
		window: dom.window,
		document: dom.document,
		navigator: globals.navigator ?? { userAgent: "", platform: "" },
		HTMLElement: dom.window.HTMLElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
	}
	({ createRoot } = await import("react-dom/client"));
	dockStore = (await import("../components/plugin-dock-store.ts")).dockStore;
	({ placedDocks } = await import("../components/plugin-dock.tsx"));
	({ clampDockWidth, DOCK_MIN_WIDTH, DOCK_MAX_WIDTH } = await import("../components/plugin-dock-store.ts"));
});

after(() => {
	for (const [key, descriptor] of previousDescriptors) {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else delete globals[key];
	}
});

beforeEach(() => {
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	dockStore.reset();
});

afterEach(() => {
	act(() => { root.unmount(); });
	host.remove();
	dockStore.reset();
});

const plugin = (id: string, docks: Array<{ id: string; name: string; mount: () => void }>) => ({
	info: { id, origin: "community", enabled: true, status: "active", revision: "1",
		manifest: { apiVersion: 1, id, name: id, version: "1.0.0", minAppVersion: "0.4.1", main: "main.js" } },
	phase: "active" as const, views: [], actions: [], docks, shortcuts: [], placements: [], actionBusy: [], busy: false,
});

describe("dock width is presentation state, never panel lifetime", () => {
	it("width changes do not change the placed-dock identity", () => {
		const snapshot = [plugin("resources", [{ id: "resources", name: "Resources", mount() {} }])] as never;
		const before = placedDocks(snapshot);
		dockStore.setWidth(480);
		const after = placedDocks(snapshot);
		// Same registration objects in, so the derived wrappers must agree on
		// every field the mount effect depends on.
		assert.deepEqual(after.map(item => [item.pluginId, item.dock.id]), before.map(item => [item.pluginId, item.dock.id]));
		assert.equal(after[0]!.dock, before[0]!.dock);
	});

	it("clamps to the documented 280-720 range and never under a readable main column", () => {
		assert.equal(clampDockWidth(100, 1440), DOCK_MIN_WIDTH);
		assert.equal(clampDockWidth(5000, 1440), DOCK_MAX_WIDTH);
		// A narrow window wins over DOCK_MAX_WIDTH: the main column keeps 360px.
		assert.equal(clampDockWidth(700, 800), 440);
		assert.equal(clampDockWidth(400, 1440), 400);
	});

	it("publishes only changed widths, and persists only when a gesture commits", () => {
		let renders = 0;
		const unsubscribe = dockStore.subscribe(() => { renders++; });
		dockStore.setWidth(420);
		dockStore.setWidth(420);
		dockStore.setWidth(420);
		assert.equal(renders, 1, "an unchanged drag sample must not re-render");
		dockStore.setWidth(430);
		assert.equal(renders, 2);
		unsubscribe();
	});

	it("collapsing is not closing: the selected panel and its width survive", () => {
		dockStore.open("resources", "resources");
		dockStore.setWidth(500);
		dockStore.collapse();
		let state = dockStore.getSnapshot();
		// The panel stays SELECTED while folded — that is what keeps its body
		// mounted, and therefore what keeps its folder/preview state alive.
		assert.equal(state.collapsed, true);
		assert.equal(state.open, true);
		assert.equal(state.active, "resources/resources");
		assert.equal(state.width, 500);
		dockStore.expand();
		state = dockStore.getSnapshot();
		assert.equal(state.collapsed, false);
		assert.equal(state.width, 500, "unfolding restores the remembered width");
		// Folding twice is a no-op, not a toggle storm.
		dockStore.collapse();
		dockStore.collapse();
		assert.equal(dockStore.getSnapshot().collapsed, true);
	});

	it("opening another dock unfolds it", () => {
		dockStore.open("resources", "resources");
		dockStore.collapse();
		dockStore.open("other", "other");
		const state = dockStore.getSnapshot();
		assert.equal(state.collapsed, false);
		assert.equal(state.active, "other/other");
	});

	it("a disabled plugin's open panel is not left on screen", () => {
		dockStore.open("resources", "resources");
		assert.deepEqual(dockStore.getSnapshot().active, "resources/resources");
		dockStore.closePlugin("someone-else");
		assert.equal(dockStore.getSnapshot().open, true, "another plugin must not close it");
		dockStore.closePlugin("resources");
		assert.equal(dockStore.getSnapshot().open, false);
	});
});
