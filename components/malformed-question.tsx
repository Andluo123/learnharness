"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t.ts";

/** Recovery belongs to the transcript, never the answer dock. The caller
 * only offers it for the current saved malformed batch, not failed/aborted
 * generations or historical attempts. */
export function MalformedQuestion({ onRetry, disabled, reason }: {
	onRetry?: () => void;
	disabled?: boolean;
	reason?: string;
}) {
	const t = useT("malformedQuestion");
	return (
		<div data-testid="malformed-question" className="my-2 rounded-xl border border-dashed bg-card/60 p-3 text-sm text-muted-foreground">
			<p>{t("cannotDisplay")}{onRetry ? " " + t("retryOrSend") : ""}</p>
			{onRetry && <Button type="button" variant="outline" size="xs" className="mt-2" disabled={disabled}
				title={reason ?? t("requestReplacement")} data-testid="retry-malformed-question" onClick={onRetry}>
				{t("retryQuestion")}
			</Button>}
			{reason && <p className="mt-1 text-xs">{reason}</p>}
		</div>
	);
}
