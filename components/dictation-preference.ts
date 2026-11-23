"use client";

import { useSyncExternalStore } from "react";

import {
	createWriteQueue,
	FACTORY_SETTINGS, isDictationLanguage, sanitizeUserSettings,
	type DictationLanguage, type DictationSettings, type UserSettings,
} from "@/src/core";
import { notifySettingsSaved, onSettingsSaved } from "@/components/settings-signal";

const INITIAL = {
	language: undefined as DictationLanguage | undefined,
	detectLanguage: false as boolean,
	autoSend: false as boolean,
	continuousReadback: false as boolean,
	saving: false as boolean,
	error: null as string | null,
};

/** One confirmed preference and one write in flight, shared by every composer surface. */
export function createDictationLanguageStore(request: typeof fetch, saved: () => void = () => {}) {
	let snapshot = INITIAL;
	let reading: Promise<DictationSettings> | null = null;
	let revision = 0;
	/** The pending write, if any: readers wait for it. */
	/** The pending write, if any: readers wait for it. */
	const writing = { get current(): Promise<boolean> | null { return writes.pending(); } };
	let needsRead = true;
	/** The single-choice fields: a competing selection of one of these is
	 *  rejected instead of queued. Every other field is an independent
	 *  flag, so toggling one must never cancel another. */
	/** The last confirmed values; a failed write rolls back to them. */
	let confirmed: DictationSettings = {
		...FACTORY_SETTINGS.dictation,
	};
	/** The write queue: one section write at a time, so two overlapping
	 *  writes can never undo each other. */
	const writes = createWriteQueue<DictationSettings>({
		// The language is one exclusive choice: a competing selection while
		// a write is pending is rejected, never queued.
		exclusiveFields: ["language"],
		confirmed: () => confirmed,
		confirm: (next) => { confirmed = next; needsRead = false; },
		body: (base, patch) => ({
			language: base.language ?? FACTORY_SETTINGS.dictation.language,
			detectLanguage: base.detectLanguage,
			autoSend: base.autoSend,
			continuousReadback: base.continuousReadback,
			...patch,
		}),
		read: (payload) => {
			const stored = (payload as { settings?: UserSettings })?.settings?.dictation;
			if (!stored) return null;
			return {
				language: stored.language ?? FACTORY_SETTINGS.dictation.language,
				detectLanguage: stored.detectLanguage ?? FACTORY_SETTINGS.dictation.detectLanguage,
				autoSend: stored.autoSend ?? FACTORY_SETTINGS.dictation.autoSend,
				continuousReadback: stored.continuousReadback ?? FACTORY_SETTINGS.dictation.continuousReadback,
			};
		},
		project: (fields, next) => {
			// Publish only the fields this write owns: a queued write keeps
			// its own optimistic value until it is confirmed.
			publish({
				...(fields.includes("language") ? { language: next.language } : {}),
				...(fields.includes("detectLanguage") ? { detectLanguage: next.detectLanguage } : {}),
				...(fields.includes("autoSend") ? { autoSend: next.autoSend } : {}),
				...(fields.includes("continuousReadback") ? { continuousReadback: next.continuousReadback } : {}),
				error: null,
			});
		},
		send: async (body) => {
			const res = await request("/api/settings/dictation", {
				method: "PUT", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error();
			return await res.json();
		},
		saved: () => saved(),
		failed: (fields, last) => {
			// Roll back only the fields this write owned.
			publish({
				...(fields.includes("language") ? { language: last.language } : {}),
				...(fields.includes("detectLanguage") ? { detectLanguage: last.detectLanguage } : {}),
				...(fields.includes("autoSend") ? { autoSend: last.autoSend } : {}),
				...(fields.includes("continuousReadback") ? { continuousReadback: last.continuousReadback } : {}),
			});
			publish({ error: "Could not save dictation settings. Try again." });
		},
	});
	const listeners = new Set<() => void>();
	const publish = (patch: Partial<typeof INITIAL>) => {
		snapshot = { ...snapshot, ...patch };
		for (const listener of listeners) listener();
	};

	function load(refresh = false): Promise<DictationSettings> {
		if (writing.current) return getSettings();
		if (reading && !refresh) return reading;
		if (!refresh && !needsRead && snapshot.language !== undefined) return Promise.resolve(getSettings());
		const version = ++revision;
		needsRead = true;
		reading = Promise.resolve().then(async () => {
			try {
				const res = await request("/api/settings");
				if (!res.ok) throw new Error();
				const body = await res.json() as { settings: UserSettings | null };
				if (!("settings" in body)) throw new Error();
				const record = sanitizeUserSettings(body.settings);
				if (body.settings !== null && record === null) throw new Error();
				if (version !== revision) return getSettings();
				// The stored section is replace-whole, so a partial record is legal:
				// every absent field resolves to the factory value (same rule as
				// resolveSettings), never to "unknown" in the picker.
				const settings: DictationSettings = {
					language: record?.dictation?.language ?? FACTORY_SETTINGS.dictation.language,
					detectLanguage: record?.dictation?.detectLanguage ?? FACTORY_SETTINGS.dictation.detectLanguage,
					autoSend: record?.dictation?.autoSend ?? FACTORY_SETTINGS.dictation.autoSend,
					continuousReadback: record?.dictation?.continuousReadback ?? FACTORY_SETTINGS.dictation.continuousReadback,
				};
				confirmed = settings;
				needsRead = false;
				publish({ language: settings.language, detectLanguage: settings.detectLanguage, autoSend: settings.autoSend, continuousReadback: settings.continuousReadback, error: null });
				return settings;
			} catch {
				if (version !== revision) return getSettings();
				const message = "Could not load dictation language. Try again.";
				publish({ error: message });
				throw new Error(message);
			} finally {
				if (version === revision) reading = null;
			}
		});
		return reading;
	}

	function save(patch: Partial<DictationSettings>): Promise<boolean> {
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
		// back to the last confirmed values.
		publish({ ...patch, saving: true, error: null });
		return promise.then((ok) => {
			if (!writes.busy()) publish({ saving: false });
			return ok;
		});
	}

	async function getSettings(): Promise<DictationSettings> {
		for (;;) {
			const pending = writing.current;
			if (pending) { await pending; continue; }
			if (reading) { await reading; continue; }
			if (needsRead || snapshot.language === undefined) { await load(); continue; }
			return {
				language: snapshot.language!,
				detectLanguage: snapshot.detectLanguage,
				autoSend: snapshot.autoSend,
				continuousReadback: snapshot.continuousReadback,
			};
		}
	}

	return {
		load, save, getSettings,
		getSnapshot: () => snapshot,
		getServerSnapshot: () => INITIAL,
		subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
	};
}

let announcingSave = false;
const store = createDictationLanguageStore((...args) => fetch(...args), () => {
	announcingSave = true;
	try { notifySettingsSaved("dictation"); } finally { announcingSave = false; };
});
let readers = 0;
let stopSignals: (() => void) | undefined;

function subscribe(listener: () => void) {
	const off = store.subscribe(listener);
	if (readers++ === 0) {
		stopSignals = onSettingsSaved((section) => {
			if (section === "dictation" && !announcingSave) void store.load(true).catch(() => {});
		});
		void store.getSettings().catch(() => {});
	}
	return () => { off(); if (--readers === 0) { stopSignals?.(); stopSignals = undefined; } };
}

export function useDictationSettings() {
	const snapshot = useSyncExternalStore(subscribe, store.getSnapshot, store.getServerSnapshot);
	return {
		...snapshot,
		load: store.load,
		save: store.save,
		getSettings: store.getSettings,
	};
}

// Backward-compatible alias: the language picker still reads the old name.
export function useDictationLanguage() {
	const storeSnapshot = useDictationSettings();
	return {
		language: storeSnapshot.language,
		saving: storeSnapshot.saving,
		error: storeSnapshot.error,
		load: async () => (await store.load()).language,
		save: async (code: DictationLanguage) => storeSnapshot.save({ language: code }),
		getLanguage: async () => (await storeSnapshot.getSettings()).language,
	};
}