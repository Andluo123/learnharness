"use client";

/**
 * SPEECH PLAYER — the shared TTS runtime.
 *
 * ONE player per window. Every surface (a message bubble, a selection, a
 * question card) asks the same player to read something; the player owns
 * the queue, the synthesis and the playback, so two surfaces can never
 * talk over each other.
 *
 * The audio is synthesized by the SERVER (POST /api/tts/speak) — the
 * renderer holds no credential. The player only ever sees bytes.
 *
 * The continuous mode lives here too: with autoRead on, a new assistant
 * answer is queued as soon as it arrives.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSpeechConfig, type SpeechConfig, speechChunks, speechVoiceLanguage } from "@/src/core";

/** What the player is doing right now. */
export type SpeechPhase = "idle" | "synthesizing" | "playing" | "error";

export interface SpeechState {
	phase: SpeechPhase;
	/** The label of the thing being read (a message, a selection). */
	label: string | null;
	error: string | null;
	/** True while the continuous mode is armed. */
	autoRead: boolean;
}

export interface SpeechController {
	/** Read a Markdown passage. Returns false when there was nothing to say. */
	speak(text: string, options?: { label?: string; voice?: string }): Promise<boolean>;
	/** Stop everything and drop the queue. */
	stop(): void;
	/** Turn the continuous mode on or off. */
	setAutoRead(on: boolean): void;
	/** The current state, for a button that shows progress. */
	state(): SpeechState;
	/** Subscribe to state changes. */
	subscribe(listener: () => void): () => void;
}

/** The chunk size the server accepts comfortably. */
const CHUNK_MAX = 200;

/** The pause between two chunks — a breath, not a gap. */
const CHUNK_GAP_MS = 120;

/** The live configuration, pushed in by the settings surface. The player
 *  reads it per chunk, so a settings change takes effect on the next
 *  passage without restarting anything. */
const liveConfig: { value: SpeechConfig } = { value: resolveSpeechConfig(undefined) };

/** The player's configuration, refreshed from the settings record. */
export function setSpeechConfig(next: SpeechConfig) {
	liveConfig.value = next;
}

/** The window-wide player. A module singleton mirrors the dictation
 *  wave's approach: the mic belongs to whoever is recording, the voice
 *  belongs to whoever asked first. */
let controller: SpeechController | null = null;
const listeners = new Set<() => void>();
let state: SpeechState = { phase: "idle", label: null, error: null, autoRead: false };

function publish(next: SpeechState) {
	state = next;
	for (const listener of listeners) listener();
}

function createController(): SpeechController {
	/** The passages waiting to be read. */
	let queue: { text: string; voice?: string }[] = [];
	let playing = false;
	let currentAudio: HTMLAudioElement | null = null;
	/** The run generation. A new request bumps it, which retires the
	 *  previous run's in-flight await — the dictation wave's pattern, and
	 *  the reason a take-over never plays the old passage to the end. */
	let generation = 0;

	const update = (patch: Partial<SpeechState>) => publish({ ...state, ...patch });

	/** Play one blob of audio, resolving when it finishes. */
	function playAudio(url: string): Promise<void> {
		return new Promise((resolve) => {
			const audio = new Audio(url);
			currentAudio = audio;
			const done = () => {
				if (currentAudio === audio) currentAudio = null;
				resolve();
			};
			audio.addEventListener("ended", done, { once: true });
			audio.addEventListener("error", done, { once: true });
			audio.play().catch(() => {
				// Autoplay policy or a decode failure: stop the run rather
				// than silently pretending it worked.
				done();
			});
		});
	}

	/** Synthesize and play the queue until it is empty. */
	async function drain(run: number) {
		if (playing) return;
		playing = true;
		try {
			while (queue.length > 0 && run === generation) {
				const item = queue.shift()!;
				const chunks = speechChunks(item.text, CHUNK_MAX, {
					readCode: liveConfig.value.readCode,
					// A formula is read in the language the voice speaks.
					math: liveConfig.value.readMath ? "read" : "skip",
					mathLocale: liveConfig.value.language === "en"
						? "en"
						: liveConfig.value.language === "zh"
							? "zh"
							: (speechVoiceLanguage(liveConfig.value.voice, liveConfig.value.provider) === "en" ? "en" : "zh"),
					// Flux misreads a lone Latin letter; Edge reads it correctly,
					// so only the provider that needs the crutch gets it.
					letterNames: liveConfig.value.provider !== "edge",
				});
				if (chunks.length === 0) continue;
				update({ phase: "synthesizing", error: null });
				for (const chunk of chunks) {
					if (run !== generation) return;
					try {
						const res = await fetch("/api/tts/speak", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ text: chunk, voice: item.voice }),
						});
						if (!res.ok) {
							const body = (await res.json().catch(() => null)) as { error?: string } | null;
							throw new Error(body?.error ?? `Speech synthesis failed (${res.status})`);
						}
						const blob = await res.blob();
						const url = URL.createObjectURL(blob);
						try {
							update({ phase: "playing" });
							await playAudio(url);
						} finally {
							URL.revokeObjectURL(url);
						}
						if (run !== generation) return;
						if (chunks.length > 1) {
							await new Promise((resolve) => setTimeout(resolve, CHUNK_GAP_MS));
						}
					} catch (error) {
						if (run !== generation) return;
						update({
							phase: "error",
							error: error instanceof Error ? error.message : "Speech synthesis failed",
						});
						return;
					}
				}
			}
		} finally {
			if (run === generation) {
				playing = false;
				update({ phase: "idle", label: null });
			}
		}
	}

	return {
		async speak(text, options) {
			if (!text?.trim()) return false;
			// A new request takes over: the previous passage stops.
			generation++;
			const run = generation;
			currentAudio?.pause();
			currentAudio = null;
			queue = [{ text, voice: options?.voice }];
			playing = false;
			update({ phase: "synthesizing", label: options?.label ?? null, error: null });
			void drain(run);
			return true;
		},
		stop() {
			generation++;
			queue = [];
			currentAudio?.pause();
			currentAudio = null;
			playing = false;
			update({ phase: "idle", label: null, error: null });
		},
		setAutoRead(on) {
			update({ autoRead: on });
		},
		state() {
			return state;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
	};
}

/** The window-wide player, created on first use. */
export function speechController(): SpeechController {
	if (!controller) controller = createController();
	return controller;
}

/** Subscribe a component to the player's state. */
export function useSpeechState(): SpeechState {
	const [snapshot, setSnapshot] = useState<SpeechState>(() => speechController().state());
	const subscribe = useCallback((listener: () => void) => speechController().subscribe(listener), []);
	useEffect(() => subscribe(() => setSnapshot(speechController().state())), [subscribe]);
	return snapshot;
}
