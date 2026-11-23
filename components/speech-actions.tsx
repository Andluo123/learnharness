"use client";

/**
 * The selection-toolbar read action.
 *
 * A factory, not a component: the toolbar takes plain action objects, and
 * the chat page owns the player. The factory is given the player so a
 * selection can be read without the toolbar knowing anything about audio.
 */

import { Volume2Icon } from "lucide-react";
import type { SelectionAction } from "@/components/selection-toolbar";
import { speechController } from "@/components/speech-player";

/** Build the "read aloud" action for the selection toolbar. */
export function createSpeakSelectionAction(t: (key: string) => string): SelectionAction {
	return {
		id: "speak-selection",
		label: t("readAloud"),
		ariaLabel: t("readAloud"),
		icon: Volume2Icon,
		visible: () => true,
		onSelect: (capture) => {
			const text = capture.selector.text.trim();
			if (!text) return false;
			void speechController().speak(text, { label: `selection-${capture.messageId}` });
			return true;
		},
	};
}
