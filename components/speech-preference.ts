"use client";

/**
 * The speech (TTS) preferences, shared by every reader surface.
 *
 * The same shape as the dictation language store (dictation-preference.ts):
 * a module-level store over useSyncExternalStore, one confirmed record,
 * one write in flight. Every surface that needs the current voice or the
 * continuous-mode switch reads it from here.
 */

import { useSyncExternalStore } from "react";
import {
	createWriteQueue,
	FACTORY_SETTINGS,
	resolveSpeechConfig,
	sanitizeUserSettings,
	type SpeechConfig,
	type UserSettings,
} from "@/src/core";
import { notifySettingsSaved, onSettingsSaved } from "@/components/settings-signal";
import { setSpeechConfig } from "@/components/speech-player";

const INITIAL = {
	config: resolveSpeechConfig(FACTORY_SETTINGS.speech),
	saving: false,
	error: null as string | null,
	loaded: false,
};

/**
 * The store factory. The fetch and the save callback are injected so the
 * tests stay isolated from the network.
 */
export function createSpeechStore(
	request: typeof fetch,
	saved: () => void = () => {},
) {
	let snapshot = INITIAL;
	let reading: Promise<SpeechConfig> | null = null;
	let revision = 0;
	/** The pending write, if any: readers wait for it. */
	const writing = { get current(): Promise<boolean> | null { return writes.pending(); } };
	let needsRead = true;
	/** The last confirmed configuration; a failed write rolls back to it. */
	let confirmedConfig: SpeechConfig = resolveSpeechConfig(FACTORY_SETTINGS.speech);
	/** The given fields of one configuration, and nothing else. */
	const pickFields = (config: SpeechConfig, fields: string[]) => {
		const picked: Partial<SpeechConfig> = {};
		for (const field of fields) {
			if (field in config) (picked as Record<string, unknown>)[field] = (config as unknown as Record<string, unknown>)[field];
		}
		return picked;
	};

	/** The write queue: one section write at a time, so two overlapping
	 *  writes can never undo each other. */

	const writes = createWriteQueue<SpeechConfig>({
		// The provider, the voice and the speed are one exclusive choice: a
		// competing selection while a write is pending is rejected, never queued.
		exclusiveFields: ["provider", "voice", "speed", "language", "customModel", "customVoice", "format"],
		confirmed: () => confirmedConfig,
		confirm: (next) => { confirmedConfig = next; needsRead = false; },
		body: (base, patch) => ({ ...base, ...patch }),
		read: (payload) => {
			const stored = (payload as { settings?: UserSettings })?.settings?.speech;
			if (!stored) return null;
			return resolveSpeechConfig(stored);
		},
		project: (fields, next) => {
			// Publish only the fields this write owns: a queued write keeps
			// its own optimistic value until it is confirmed.
			publish({ config: { ...snapshot.config, ...pickFields(next, fields) }, error: null, loaded: true });
		},
		send: async (body) => {
			const res = await request("/api/settings/speech", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error();
			return await res.json();
		},
		saved: () => saved(),
		failed: (fields, last) => {
			// Roll back only the fields this write owned.
			publish({ config: { ...snapshot.config, ...pickFields(last, fields) } });
			publish({ error: "Could not save speech settings. Try again." });
		},
	});
	const listeners = new Set<() => void>();
	const publish = (patch: Partial<typeof INITIAL>) => {
		snapshot = { ...snapshot, ...patch };
		// The player reads the configuration live, so a settings change
		// takes effect on the next passage.
		setSpeechConfig(snapshot.config);
		for (const listener of listeners) listener();
	};

	function load(refresh = false): Promise<SpeechConfig> {
		if (writing.current) return Promise.resolve(snapshot.config);
		if (reading && !refresh) return reading;
		if (!refresh && !needsRead && snapshot.loaded) return Promise.resolve(snapshot.config);
		const version = ++revision;
		needsRead = true;
		reading = Promise.resolve().then(async () => {
			try {
				const res = await request("/api/settings");
				if (!res.ok) throw new Error();
				const body = (await res.json()) as { settings: UserSettings | null };
				if (!("settings" in body)) throw new Error();
				const record = sanitizeUserSettings(body.settings);
				if (body.settings !== null && record === null) throw new Error();
				if (version !== revision) return snapshot.config;
				const config = resolveSpeechConfig(record?.speech);
				confirmedConfig = config;
				needsRead = false;
				publish({ config, error: null, loaded: true });
				return config;
			} catch {
				if (version !== revision) return snapshot.config;
				const message = "Could not load speech settings. Try again.";
				publish({ error: message });
				throw new Error(message);
			} finally {
				if (version === revision) reading = null;
			}
		});
		return reading;
	}

	function save(patch: Partial<SpeechConfig>): Promise<boolean> {
		if (Object.keys(patch).length === 0) return Promise.resolve(false);
		// A competing SELECTION of the same single-choice field must never
		// inherit the pending write's success, so it is rejected outright.
		// Independent flags are queued instead: a click is never lost.
		if (writes.conflicts(patch)) return Promise.resolve(false);
		// A pending read must not overwrite this newer choice.
		revision++;
		reading = null;
		// Register the write BEFORE publishing the busy state: a reader that
		// reacts to the busy flag has to wait for this very write.
		const promise = writes.write(patch);
		// Optimistic flip so the switch reacts immediately; a failed write rolls
		// back to the last confirmed configuration.
		publish({ config: { ...snapshot.config, ...patch }, saving: true, error: null });
		return promise.then((ok) => {
			if (!writes.busy()) publish({ saving: false });
			return ok;
		});
	}

	return {
		load,
		save,
		getSnapshot: () => snapshot,
		getServerSnapshot: () => INITIAL,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
	};
}

let announcingSave = false;
const store = createSpeechStore((...args) => fetch(...args), () => {
	announcingSave = true;
	try { notifySettingsSaved("speech"); } finally { announcingSave = false; }
});
let readers = 0;
let stopSignals: (() => void) | undefined;

function subscribe(listener: () => void) {
	const off = store.subscribe(listener);
	if (readers++ === 0) {
		stopSignals = onSettingsSaved((section) => {
			if (section === "speech" && !announcingSave) void store.load(true).catch(() => {});
		});
		// The preferences live for the window, not the page: navigation and
		// reopening Settings must not add a new network failure point.
		void store.load().catch(() => {});
	}
	return () => { off(); if (--readers === 0) { stopSignals?.(); stopSignals = undefined; } };
}

/** The speech preferences, plus the writer. */
export function useSpeechSettings() {
	const snapshot = useSyncExternalStore(subscribe, store.getSnapshot, store.getServerSnapshot);
	return { ...snapshot, load: store.load, save: store.save };
}
