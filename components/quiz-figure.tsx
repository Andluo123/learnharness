"use client";

import { SvgImage } from "@/components/artifacts/svg-image";
import { useImageSnapshot } from "@/components/artifacts/use-image-snapshot";
// Architecture law: the browser shell imports the pure core ONLY through
// the barrel (docs/architecture.md).
import { embedLearnerImage, type QuizFigure } from "@/src/core";

/** A quiz figure (quiz figures, owner 2026-11-18): the SVG a visual job
 *  delivered, shown INSIDE the answer card. The figure arrives as a
 *  reference resolved from the session's own delivered visuals — this
 *  component renders what the resolution produced, nothing else.
 *
 *  An annotating figure (a learner photo with marks drawn on it) keeps
 *  its placeholder href until the snapshot loads: rendering early would
 *  show a blank picture where the photo belongs, so the annotated form
 *  waits for its bytes (the transcript's own visual card follows the
 *  same rule). */
export function QuizFigureImage({ figure, size = "question" }: { figure: QuizFigure; size?: "question" | "option" }) {
	const snapshot = useImageSnapshot(figure.snapshotId);
	if (figure.snapshotId && !snapshot.image) return null;
	const svg = figure.snapshotId && snapshot.image ? embedLearnerImage(figure.svg, snapshot.image) : figure.svg;
	return (
		<div
			data-testid="quiz-figure"
			data-figure-size={size}
			className={size === "question" ? "mb-3 flex justify-center" : "my-1 flex justify-center"}
		>
			<SvgImage
				svg={svg}
				className={size === "question" ? "max-h-64 w-auto max-w-full rounded-lg border bg-white dark:bg-white" : "max-h-40 w-auto max-w-full rounded-lg border bg-white dark:bg-white"}
			/>
		</div>
	);
}
