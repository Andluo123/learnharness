"use client";

/**
 * The read-aloud button.
 *
 * One component, used in three places: a message bubble, a selection
 * toolbar and a question card. It asks the window-wide player to read,
 * and it shows what the player is doing — the same player, so two buttons
 * can never talk over each other.
 */

import { useCallback } from "react";
import { Loader2Icon, SquareIcon, Volume2Icon } from "lucide-react";
import { MessageAction } from "@/components/ai-elements/message";
import { speechController, useSpeechState } from "@/components/speech-player";
import { useT } from "@/i18n/use-t.ts";

export interface SpeakButtonProps {
	/** The Markdown to read. */
	text: string;
	/** The label of the thing being read (shown in the tooltip). */
	label?: string;
	/** A one-off voice override (a preview). */
	voice?: string;
	className?: string;
}

/** The read-aloud button. Hidden until the row is hovered (the copy
 *  button's pattern), but always reachable by keyboard. */
export function SpeakButton({ text, label, voice, className }: SpeakButtonProps) {
	const t = useT("speech");
	const state = useSpeechState();
	const busy = state.phase === "synthesizing" || state.phase === "playing";
	const active = busy && state.label === label;

	const onClick = useCallback(() => {
		const player = speechController();
		if (active) player.stop();
		else void player.speak(text, { label, voice });
	}, [active, label, text, voice]);

	const tooltip = active
		? t("stopReading")
		: busy
			? t("readingElsewhere")
			: t("readAloud");

	return (
		<MessageAction
			type="button"
			tooltip={tooltip}
			label={tooltip}
			data-testid="speak-button"
			aria-label={tooltip}
			className={className}
			onClick={onClick}
		>
			{active ? (
				state.phase === "synthesizing" ? (
					<Loader2Icon className="size-3.5 animate-spin" />
				) : (
					<SquareIcon className="size-3.5" />
				)
			) : (
				<Volume2Icon className="size-3.5" />
			)}
		</MessageAction>
	);
}
