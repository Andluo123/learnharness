/**
 * Quiz figures (owner, 2026-11-18): a quiz question can carry a figure —
 * the SVG a visual job already delivered in this session — so a geometry
 * question shows its picture INSIDE the answer card, not only in the
 * transcript above.
 *
 * The reference is a tool call id, never a path or a URL: the figure is
 * looked up in the session's own delivered visual results. Nothing new is
 * stored, nothing remote is fetched, and the markdown image blocklist
 * (streamdownRehypePlugins) stays exactly as it is.
 */

/** One figure a quiz references: the delivered SVG, plus the learner-image
 *  snapshot when the figure annotates one (rendering embeds the photo). */
export interface QuizFigure {
	svg: string;
	/** Present when the figure annotates a learner image (issue #363). */
	snapshotId?: string;
}

/** A delivered visual steer's details (contracts/jobs SteerDetails, read
 *  structurally — this module must not import the job store's types). */
interface VisualSteerDetails {
	kind?: unknown;
	toolCallId?: unknown;
	result?: { svg?: unknown; image?: { snapshotId?: unknown } };
}

/** Read one record message's delivered figure, if it is a successful
 *  visual steer. Pure over the marker shape (customType + details). */
export function deliveredFigureOfMessage(message: unknown): QuizFigure | null {
	if (typeof message !== "object" || message === null) return null;
	const m = message as { role?: string; customType?: string; details?: VisualSteerDetails };
	if (m.role !== "custom" || m.customType !== "subagent-steer") return null;
	const d = m.details;
	if (!d || d.kind !== "visual" || typeof d.toolCallId !== "string") return null;
	const svg = d.result?.svg;
	if (typeof svg !== "string" || svg.length === 0) return null;
	const snapshotId = d.result?.image?.snapshotId;
	return typeof snapshotId === "string" && snapshotId.length > 0
		? { svg, snapshotId }
		: { svg };
}

/** The session's delivered figures keyed by tool-call id (the reference
 *  space). Later deliveries of the same call id win; failed visuals
 *  (empty svg) never enter the map. Shared by the server's quiz validation
 *  (figureProblem against these ids) and the client's render lookup. */
export function deliveredFigures(messages: readonly unknown[]): Map<string, QuizFigure> {
	const figures = new Map<string, QuizFigure>();
	for (const message of messages) {
		const m = message as { details?: { toolCallId?: unknown } };
		const figure = deliveredFigureOfMessage(message);
		if (figure && typeof m.details?.toolCallId === "string") figures.set(m.details.toolCallId, figure);
	}
	return figures;
}

/** A figure reference is a tool-call id string; anything else is not a
 *  reference at all (a model that writes prose here gets no figure). */
export function isFigureReference(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Resolve one reference against the session's delivered figures.
 *  Unknown, empty, or failed (empty-svg) figures resolve to nothing —
 *  the card renders without a picture rather than showing a hole. */
export function resolveQuizFigure(
	reference: unknown,
	figures: ReadonlyMap<string, QuizFigure>,
): QuizFigure | null {
	const id = isFigureReference(reference);
	if (!id) return null;
	const figure = figures.get(id);
	return figure && figure.svg.length > 0 ? figure : null;
}

/** The teacher-facing correction when a quiz references a figure that is
 *  not available: the honest list of what it CAN reference. Mirrors the
 *  nodeIdProblem pattern (src/agent/tools.ts) — the call returns to the
 *  model with copyable ids rather than silently dropping the picture. */
export function figureProblem(figure: string, available: readonly string[]): string | null {
	// Trimmed exactly like the resolver (isFigureReference): a padded id is
	// the same reference at the boundary and in the dock — never a
	// validation failure that later renders a picture anyway.
	const reference = isFigureReference(figure);
	if (reference === null || available.includes(reference)) return null;
	return available.length === 0
		? `figure "${reference}" matches no figure delivered in this session. No visual job has completed yet — call visual and wait for its result steer before referencing it, or omit figure.`
		: `figure "${reference}" matches no figure delivered in this session. Copy one of the delivered figure ids exactly (${available.slice(0, 5).join(", ")}${available.length > 5 ? ", \u2026" : ""}), or omit figure.`;
}
