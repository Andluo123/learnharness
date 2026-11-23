/** Right-hand plugin dock: one shared window-level column.
 *
 * Kept outside React so ctx.app.openDock() (plugin code, no React context) and
 * the dock component can share exactly one truth. The host component subscribes;
 * persist/restore is the component's job because it owns viewport clamping.
 *
 * Three independent facts, deliberately not one "mode":
 *   open       which panel is showing (null = nothing selected yet)
 *   collapsed  whether that panel is folded into the narrow rail
 *   width      the expanded pixel width
 * Collapsing is NOT closing: the panel body stays mounted so its own state
 * (the folder being browsed, the file being previewed) survives. */

export interface DockState {
	/** Whether a panel is selected. False only before the first open. */
	open: boolean;
	/** "<pluginId>/<dockId>" of the selected panel, or null when none is open. */
	active: string | null;
	/** Folded into the rail; the panel body stays mounted but hidden. */
	collapsed: boolean;
	/** Persisted expanded pixel width; the component clamps to the live viewport. */
	width: number;
}

export const DOCK_MIN_WIDTH = 280;
export const DOCK_MAX_WIDTH = 720;
export const DOCK_DEFAULT_WIDTH = 360;
/** The transcript column keeps at least this much width before the dock clamps. */
export const DOCK_MAIN_MIN_WIDTH = 360;
export const DOCK_WIDTH_KEY = "lh:plugin-dock:width";

export const dockKey = (pluginId: string, dockId: string) => `${pluginId}/${dockId}`;

export const clampDockWidth = (width: number, viewport: number): number => {
	if (!Number.isFinite(width)) return DOCK_DEFAULT_WIDTH;
	const ceiling = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, viewport - DOCK_MAIN_MIN_WIDTH));
	return Math.round(Math.min(Math.max(width, DOCK_MIN_WIDTH), ceiling));
};

function initial(): DockState {
	const fallback: DockState = { open: false, active: null, collapsed: false, width: DOCK_DEFAULT_WIDTH };
	try {
		const stored = Number(globalThis.localStorage?.getItem(DOCK_WIDTH_KEY));
		if (Number.isFinite(stored) && stored > 0) return { ...fallback, width: stored };
	} catch { /* No storage: the default width still works. */ }
	return fallback;
}

let state: DockState = initial();
const listeners = new Set<() => void>();
const publish = (next: Partial<DockState>) => {
	state = { ...state, ...next };
	for (const listener of [...listeners]) listener();
};

export const dockStore = {
	getSnapshot: (): DockState => state,
	subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => { listeners.delete(listener); };
	},
	/** Show this panel expanded, switching away from another plugin's panel. */
	open(pluginId: string, dockId: string): void {
		publish({ open: true, active: dockKey(pluginId, dockId), collapsed: false });
	},
	/** Fold the column into its rail. The panel body keeps running. */
	collapse(): void {
		if (!state.open || state.collapsed) return;
		publish({ collapsed: true });
	},
	/** Unfold back to the remembered width. */
	expand(): void {
		if (!state.open || !state.collapsed) return;
		publish({ collapsed: false });
	},
	toggleCollapsed(): void {
		if (!state.open) return;
		publish({ collapsed: !state.collapsed });
	},
	/** Close when this plugin's panel is the selected one (ctx.app.closeDock). */
	closePlugin(pluginId: string): void {
		if (!state.active?.startsWith(`${pluginId}/`)) return;
		publish({ open: false, active: null, collapsed: false });
	},
	/** Forget everything: a disabled plugin's panel must not come back. */
	drop(pluginId: string): void {
		if (!state.active?.startsWith(`${pluginId}/`)) return;
		publish({ open: false, active: null, collapsed: false });
	},
	/** Live width during a drag: re-render, but do not touch storage yet. */
	setWidth(width: number): void {
		// A drag reports the same rounded pixel many times per second; publishing
		// an unchanged width would re-render the whole dock for nothing.
		if (width === state.width) return;
		publish({ width });
	},
	/** Commit the current width to storage once, at the end of a drag/resize. */
	persistWidth(): void {
		try { globalThis.localStorage?.setItem(DOCK_WIDTH_KEY, String(state.width)); } catch { /* best effort */ }
	},
	/** Test seam. */
	reset(): void { state = initial(); for (const listener of [...listeners]) listener(); },
};
