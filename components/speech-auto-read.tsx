"use client";

/**
 * CONTINUOUS READING (the auto-read mode).
 *
 * One tiny component, mounted by the chat page: when the continuous mode
 * is armed, every new assistant answer is read as it settles.
 *
 * It renders nothing. It only listens.
 */

import { useEffect, useMemo, useRef } from "react";
import type { LhViewMessage } from "@/src/core";
import { speechController } from "@/components/speech-player";
import { useSpeechSettings } from "@/components/speech-preference";

export interface SpeechAutoReadProps {
	/** The projected transcript (the view messages). */
	messages: LhViewMessage[];
	/** True while the turn is still streaming — a half-written answer is
	 *  never read; the passage is read once the turn settles. */
	streaming: boolean;
}

/** The newest assistant message that has text. */
export function latestAssistantAnswer(messages: readonly LhViewMessage[]): { id: string; text: string } | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (!message || message.role !== "assistant") continue;
		const text = message.parts
			.map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
			.join("\n")
			.trim();
		if (text) return { id: message.id, text };
	}
	return null;
}

/** Read every new answer as it arrives (continuous mode). */
export function SpeechAutoRead({ messages, streaming }: SpeechAutoReadProps) {
	const { config } = useSpeechSettings();
	const answer = useMemo(() => latestAssistantAnswer(messages), [messages]);
	/** The id we already read — one answer is read once. */
	const spoken = useRef<string | null>(null);
	/** Whether the mode was armed a moment ago (the arming moment must not
	 *  read the backlog). */
	const armed = useRef(false);

	useEffect(() => {
		if (!config.autoRead) {
			armed.current = false;
			spoken.current = null;
			return;
		}
		if (!armed.current) {
			armed.current = true;
			// Arming reads nothing: only answers that ARRIVE afterwards.
			spoken.current = answer?.id ?? null;
			return;
		}
		if (streaming) return;
		if (!answer || spoken.current === answer.id) return;
		spoken.current = answer.id;
		void speechController().speak(answer.text, { label: `message-${answer.id}` });
	}, [config.autoRead, streaming, answer]);

	return null;
}
