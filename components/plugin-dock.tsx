"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { PanelRightCloseIcon, PanelRightOpenIcon, PuzzleIcon } from "lucide-react";
import type { PluginDock, PluginDockCapabilities } from "@/src/core";
import type { FrontendPlugin } from "@/components/plugin-manager";
import { usePlugins } from "@/components/plugins";
import { Hint } from "@/components/ui/hint";
import { useT } from "@/i18n/use-t.ts";
import { clampDockWidth, dockKey, dockStore } from "./plugin-dock-store";

export interface PlacedDock {
	key: string;
	pluginId: string;
	dock: PluginDock;
}

/** Registered docks in plugin order; registration alone never shows a column. */
export function placedDocks(plugins: readonly FrontendPlugin[]): PlacedDock[] {
	return plugins.flatMap(plugin => {
		if (!plugin.info.enabled || plugin.phase !== "active") return [];
		return plugin.docks.map(dock => ({ key: dockKey(plugin.info.id, dock.id), pluginId: plugin.info.id, dock }));
	});
}

function DockIcon({ dock }: { dock: PluginDock }) {
	return dock.icon
		? <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: dock.icon }} />
		: <PuzzleIcon aria-hidden="true" className="size-4 shrink-0" />;
}

/** The plugin panel body. React owns only this frame; the plugin owns inside.
 *
 *  The mount effect is keyed on IDENTITY, never on the PlacedDock object:
 *  placedDocks() builds a fresh wrapper on every render, so an object
 *  dependency re-mounted the panel on each width change and threw away the
 *  plugin's own state (the reported "resizing jumps back to the list" bug). */
function DockMount({ placed, capabilities }: { placed: PlacedDock; capabilities: PluginDockCapabilities }) {
	const { manager } = usePlugins();
	const container = useRef<HTMLDivElement>(null);
	const errorRef = useRef<HTMLParagraphElement>(null);
	// Latest values without widening the mount effect's dependencies.
	const latest = useRef({ dock: placed.dock, capabilities, name: placed.dock.name });
	latest.current = { dock: placed.dock, capabilities, name: placed.dock.name };
	const pluginId = placed.pluginId;
	const dockId = placed.dock.id;
	useEffect(() => {
		if (!manager || !container.current) return;
		const show = (text: string) => {
			const node = errorRef.current;
			if (!node) return;
			node.textContent = text ? `${latest.current.name}: ${text}` : "";
		};
		show("");
		return manager.mountDock(pluginId, latest.current.dock, container.current, show, latest.current.capabilities);
	}, [manager, pluginId, dockId]);
	return <>
		<p ref={errorRef} role="alert" className="px-3 text-xs text-destructive empty:hidden" />
		<div ref={container} aria-label={placed.dock.name} data-plugin-dock-body="" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" />
	</>;
}

/** Host services for a dock panel, built from the page that owns the composer.
 * Pages differ in where their draft text lives, so text insertion is injected. */
export function createDockCapabilities(insert: (text: string) => void, read: () => string): PluginDockCapabilities {
	return {
		pickFolder: async () => {
			try { return (await window.lh?.chooseAttachmentFolder?.()) ?? null; }
			catch { return null; }
		},
		insertComposerText: (text: string) => {
			if (typeof text !== "string" || !text) return false;
			const current = read();
			const separator = !current || /\s$/.test(current) ? "" : " ";
			insert(current + separator + text);
			return true;
		},
		close: () => { dockStore.collapse(); },
	};
}

/** The dock's collapse/expand control as a top-bar item, so it shares the
 *  header row with the plugin actions instead of floating over the content. */
export function PluginDockTopBarToggle() {
	const t = useT("pluginChrome");
	const { snapshot } = usePlugins();
	const state = useSyncExternalStore(dockStore.subscribe, dockStore.getSnapshot, dockStore.getSnapshot);
	const docks = placedDocks(snapshot.plugins);
	const active = state.open ? docks.find(item => item.key === state.active) : null;
	if (!active) return null;
	const collapsed = state.collapsed;
	return <Hint label={collapsed ? t("expandDock") : t("collapseDock")} side="bottom">
		<button type="button" data-testid="plugin-dock-topbar-toggle" aria-pressed={!collapsed}
			aria-label={collapsed ? t("expandDock") : t("collapseDock")}
			title={collapsed ? t("expandDock") : t("collapseDock")}
			onClick={() => dockStore.toggleCollapsed()}
			className="lh-no-drag flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
			{collapsed ? <PanelRightOpenIcon className="size-4" /> : <PanelRightCloseIcon className="size-4" />}
		</button>
	</Hint>;
}

export function PluginDock({ capabilities, toggleInTopBar = false }: { capabilities: PluginDockCapabilities; toggleInTopBar?: boolean }) {
	const { snapshot } = usePlugins();
	const t = useT("pluginChrome");
	const docks = placedDocks(snapshot.plugins);
	const state = useSyncExternalStore(dockStore.subscribe, dockStore.getSnapshot, dockStore.getSnapshot);
	const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
	const active = state.open ? docks.find(item => item.key === state.active) ?? null : null;
	const width = clampDockWidth(state.width, typeof window === "undefined" ? 1280 : window.innerWidth);

	// A disabled/uninstalled plugin must not leave a stale open column.
	useEffect(() => {
		if (state.open && state.active && !active) dockStore.closePlugin(state.active.split("/")[0]!);
	}, [state.open, state.active, active]);

	const onMove = useCallback((event: PointerEvent) => {
		const session = drag.current;
		if (!session || event.pointerId !== session.pointerId) return;
		// Dragging LEFT grows the panel: the divider sits on its left edge.
		dockStore.setWidth(clampDockWidth(session.startWidth + (session.startX - event.clientX), window.innerWidth));
	}, []);

	const stop = useCallback(() => {
		if (!drag.current) return;
		drag.current = null;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", stop);
		window.removeEventListener("pointercancel", stop);
		document.body.classList.remove("lh-dock-resizing");
		// One write per gesture, not one per animation frame.
		dockStore.persistWidth();
	}, [onMove]);

	const start = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", stop);
		window.addEventListener("pointercancel", stop);
		document.body.classList.add("lh-dock-resizing");
	}, [width, onMove, stop]);

	// Keep the width legal when the window shrinks under it.
	useLayoutEffect(() => {
		const fit = () => {
			const stored = dockStore.getSnapshot().width;
			const next = clampDockWidth(stored, window.innerWidth);
			if (next !== stored) { dockStore.setWidth(next); dockStore.persistWidth(); }
		};
		fit();
		window.addEventListener("resize", fit);
		return () => window.removeEventListener("resize", fit);
	}, []);

	useEffect(() => stop, [stop]);

	if (!docks.length) return null;
	// Nothing selected yet: no column at all.
	if (!active) return null;

	// ONE tree, whatever the state. DockMount keeps the same parent element in
	// both shapes; collapsing only hides that element. Moving the mount between
	// branches (or keying it on the shape) re-mounts the plugin and throws away
	// its state — the folder and preview it had open.
	const collapsed = state.collapsed;
	const tabClass = (selected: boolean) => `flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${selected ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`;
	return <>
		{collapsed && !toggleInTopBar && <Hint label={t("expandDock")} side="left">
			<button type="button" data-testid="plugin-dock-expand" aria-label={t("expandDock")} title={t("expandDock")}
				onClick={() => dockStore.expand()}
				className="lh-no-drag fixed right-3 top-16 z-20 flex size-8 items-center justify-center rounded-md border border-border bg-card/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent hover:text-foreground">
				<PanelRightOpenIcon className="size-4" />
			</button>
		</Hint>}
		<aside data-testid="plugin-dock" data-collapsed={collapsed ? "" : undefined}
			aria-label={t("pluginDock")} aria-hidden={collapsed ? true : undefined}
			className={collapsed ? "hidden" : "relative flex min-h-0 shrink-0 flex-col border-l border-border bg-background"}
			style={collapsed ? undefined : { width }}>
			{!collapsed && <>
				{/* The divider owns a wider invisible hit area than its 1px line. */}
				<div role="separator" aria-orientation="vertical" aria-label={t("resizeDock")} tabIndex={0}
					data-testid="plugin-dock-divider"
					className="group absolute -left-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center"
					onPointerDown={start}
					onKeyDown={event => {
						if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
						event.preventDefault();
						dockStore.setWidth(clampDockWidth(width + (event.key === "ArrowLeft" ? 16 : -16), window.innerWidth));
						dockStore.persistWidth();
					}}>
					<span aria-hidden="true" className="h-full w-px bg-border opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
				</div>
				<div data-testid="plugin-dock-switcher" className="lh-no-drag flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
					{docks.map(item => <Hint key={item.key} label={item.dock.name} side="bottom">
						<button type="button" data-plugin-dock-tab={item.key} aria-pressed={item.key === active.key}
							title={item.dock.name} aria-label={item.dock.name}
							onClick={() => dockStore.open(item.pluginId, item.dock.id)}
							className={tabClass(item.key === active.key)}>
							<DockIcon dock={item.dock} />
						</button>
					</Hint>)}
					<div className="min-w-1 flex-1" aria-hidden="true" />
					{/* No collapse control here: the page's top bar owns the one
					    collapse/expand toggle (PluginDockTopBarToggle). Two buttons
					    doing the same thing in one corner is the duplicated affordance
					    this block used to create. Pages without a top bar fall back to
					    the floating toggle, which is rendered above. */}
				</div>
			</>}
			{/* Stable parent: hidden, never unmounted, never re-parented. */}
			<div data-plugin-dock-slot="" className={collapsed ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
				<DockMount key={active.key} placed={active} capabilities={capabilities} />
			</div>
		</aside>
	</>;
}
