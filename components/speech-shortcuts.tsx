"use client";

/**
 * The read-aloud keyboard shortcut (Mod+Shift+V).
 *
 * Two rules, in order: if something is already being read, stop it; if
 * nothing is being read, read the newest answer. One chord, one meaning
 * — the same shape as the dictation toggle.
 */

import { useEffect } from "react";
import { kbdEventForAction } from "@/src/core";
import { speechController } from "@/components/speech-player";

export interface SpeechShortcutProps {
	/** The newest assistant answer to read, or null when there is none. */
	latest: { id: string; text: string } | null;
}

/** Bind the read-aloud chord for as long as this component is mounted. */
export function SpeechShortcut({ latest }: SpeechShortcutProps) {
	useEffect(() => {
		const onToggle = () => {
			const player = speechController();
			const state = player.state();
			if (state.phase === "synthesizing" || state.phase === "playing") {
				player.stop();
				return;
			}
			if (!latest?.text.trim()) return;
			void player.speak(latest.text, { label: `message-${latest.id}` });
		};
		const event = kbdEventForAction("toggle-speech");
		window.addEventListener(event, onToggle);
		return () => window.removeEventListener(event, onToggle);
	}, [latest]);

	return null;
}
