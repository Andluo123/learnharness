/**
 * A serial queue for whole-section settings writes.
 *
 * The settings route replaces a whole section with the request body, so two
 * overlapping writes can undo each other: a write that carries only one field
 * wipes its siblings, and a write that lands first is overwritten by a later
 * one.
 *
 * This queue runs one write at a time. Every write sends the last CONFIRMED
 * values with its own patch applied, and it publishes only the fields it
 * touched — so a queued write's optimistic value is never clobbered by the
 * write before it, and no click is lost.
 */

export interface WriteQueueOptions<T extends object> {
	/**
	 * The fields that hold ONE exclusive choice. A competing selection of the
	 * same field while a write is pending is rejected instead of queued, so it
	 * can never inherit the pending write's success.
	 */
	readonly exclusiveFields?: readonly string[];
	/** The last confirmed values. */
	confirmed(): T;
	/** Remember the values a successful write confirmed. */
	confirm(next: T): void;
	/** Build the body of one write. */
	body(base: T, patch: Partial<T>): T;
	/** Extract the confirmed values from a successful response payload. */
	read(payload: unknown): T | null;
	/** Publish the confirmed values for the fields one write touched. */
	project(fields: string[], confirmed: T): void;
	/** Send one body; resolves with the response payload. */
	send(body: T): Promise<unknown>;
	/** Called after a successful write. */
	saved(): void;
	/** Called when a write failed. */
	failed(fields: string[], confirmed: T): void;
}

export interface WriteQueue<T extends object> {
	/** Queue one write. Resolves with whether THIS write succeeded. */
	write(patch: Partial<T>): Promise<boolean>;
	/**
	 * True when a pending write already holds one of the patch's exclusive
	 * fields. The caller checks this BEFORE it flips anything optimistically,
	 * so a rejected selection leaves the confirmed value untouched.
	 */
	conflicts(patch: Partial<T>): boolean;
	/** The promise of the current drain, or null when the queue is idle. */
	pending(): Promise<boolean> | null;
	/** True while a write is queued or in flight. */
	busy(): boolean;
}

export function createWriteQueue<T extends object>(options: WriteQueueOptions<T>): WriteQueue<T> {
	interface Task {
		seq: number;
		patch: Partial<T>;
		fields: string[];
		resolve: (ok: boolean) => void;
	}
	const exclusive = new Set<string>(options.exclusiveFields ?? []);
	const queue: Task[] = [];
	/** field -> the sequence number of the latest queued write for it. */
	const latest = new Map<string, number>();
	let seq = 0;
	let drain: Promise<boolean> | null = null;

	/**
	 * The fields this task still owns: a later queued write of the same field
	 * took ownership, so this task must not publish it any more.
	 */
	function owned(task: Task): string[] {
		const fields = task.fields.filter((field) => latest.get(field) === task.seq);
		for (const field of fields) latest.delete(field);
		return fields;
	}

	async function run(task: Task): Promise<boolean> {
		const base = options.confirmed();
		try {
			const payload = await options.send(options.body(base, task.patch));
			const next = options.read(payload);
			if (!next) throw new Error("the response carried no confirmed values");
			options.confirm(next);
			// Publish only the fields this write owns: a later queued write
			// keeps its own optimistic value until it is confirmed.
			options.project(owned(task), next);
			options.saved();
			return true;
		} catch {
			options.failed(owned(task), options.confirmed());
			return false;
		}
	}

	function drainQueue(): void {
		const task = queue.shift();
		if (!task) {
			drain = null;
			return;
		}
		const next = run(task).then((ok) => {
			task.resolve(ok);
			drainQueue();
			return ok;
		});
		drain = next;
	}

	return {
		write(patch: Partial<T>): Promise<boolean> {
			const fields = Object.keys(patch) as string[];
			if (fields.length === 0) return Promise.resolve(false);
			// A competing selection of the same exclusive field is rejected:
			// it must never inherit the pending write's success.
			if (this.conflicts(patch)) return Promise.resolve(false);
			const task: Task = { seq: ++seq, patch, fields, resolve: () => {} };
			for (const field of fields) latest.set(field, task.seq);
			const promise = new Promise<boolean>((resolve) => { task.resolve = resolve; });
			queue.push(task);
			if (!drain) drainQueue();
			return promise;
		},
		conflicts(patch: Partial<T>): boolean {
			for (const field of Object.keys(patch)) {
				if (exclusive.has(field) && latest.has(field)) return true;
			}
			return false;
		},
		pending: () => drain,
		busy: () => drain !== null,
	};
}
