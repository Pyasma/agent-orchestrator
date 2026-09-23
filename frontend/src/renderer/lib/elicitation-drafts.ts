/**
 * Renderer-owned drafts for a pending agent question (elicitation).
 *
 * The card lives in the Chat timeline, so switching sessions unmounts it and
 * takes any half-typed "Other" answer with it. The answer is not sent anywhere
 * until the human presses Continue, so the draft stays in this renderer's
 * localStorage — pinned beneath AO's userData directory — keyed by session and
 * request id, and is removed once the request is resolved.
 */

export type ElicitationDraftValue = string | number | boolean | string[];

export interface ElicitationDraft {
	values: Record<string, ElicitationDraftValue>;
	activeQuestion: number;
}

interface StoredElicitationDraft extends ElicitationDraft {
	schemaVersion: typeof ELICITATION_DRAFT_SCHEMA_VERSION;
	updatedAt: number;
}

export const ELICITATION_DRAFT_SCHEMA_VERSION = 1 as const;

const KEY_PREFIX = "ao.elicitation-draft.v1:";

/** Drafts for questions this old are abandoned; the request is long gone. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ElicitationDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> &
	Partial<Pick<Storage, "key" | "length">>;

export function elicitationDraftKey(sessionId: string, requestId: string): string {
	return `${KEY_PREFIX}${sessionId}:${requestId}`;
}

export function readElicitationDraft(
	sessionId: string,
	requestId: string,
	storage: ElicitationDraftStorage | undefined = rendererStorage(),
): ElicitationDraft | undefined {
	if (!storage) return undefined;
	let raw: string | null;
	try {
		raw = storage.getItem(elicitationDraftKey(sessionId, requestId));
	} catch {
		return undefined;
	}
	if (!raw) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;
	if (parsed.schemaVersion !== ELICITATION_DRAFT_SCHEMA_VERSION) return undefined;
	if (!isRecord(parsed.values)) return undefined;
	const values: Record<string, ElicitationDraftValue> = {};
	for (const [name, value] of Object.entries(parsed.values)) {
		if (isDraftValue(value)) values[name] = value;
	}
	return {
		values,
		activeQuestion: typeof parsed.activeQuestion === "number" && parsed.activeQuestion >= 0 ? parsed.activeQuestion : 0,
	};
}

export function writeElicitationDraft(
	sessionId: string,
	requestId: string,
	draft: ElicitationDraft,
	storage: ElicitationDraftStorage | undefined = rendererStorage(),
): void {
	if (!storage) return;
	const stored: StoredElicitationDraft = {
		schemaVersion: ELICITATION_DRAFT_SCHEMA_VERSION,
		values: draft.values,
		activeQuestion: draft.activeQuestion,
		updatedAt: Date.now(),
	};
	try {
		storage.setItem(elicitationDraftKey(sessionId, requestId), JSON.stringify(stored));
	} catch {
		return;
	}
	pruneExpiredElicitationDrafts(storage);
}

export function clearElicitationDraft(
	sessionId: string,
	requestId: string,
	storage: ElicitationDraftStorage | undefined = rendererStorage(),
): void {
	if (!storage) return;
	try {
		storage.removeItem(elicitationDraftKey(sessionId, requestId));
	} catch {
		// A draft that cannot be cleared expires on its own.
	}
}

/**
 * Drops drafts whose question was never resolved in this renderer — the app was
 * quit while a question was open, or the session was deleted underneath it.
 */
export function pruneExpiredElicitationDrafts(
	storage: ElicitationDraftStorage | undefined = rendererStorage(),
	now = Date.now(),
): void {
	if (!storage || typeof storage.key !== "function" || typeof storage.length !== "number") return;
	const expired: string[] = [];
	try {
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (!key || !key.startsWith(KEY_PREFIX)) continue;
			const raw = storage.getItem(key);
			if (!raw) continue;
			let updatedAt: unknown;
			try {
				const parsed: unknown = JSON.parse(raw);
				updatedAt = isRecord(parsed) ? parsed.updatedAt : undefined;
			} catch {
				updatedAt = undefined;
			}
			if (typeof updatedAt !== "number" || now - updatedAt > MAX_AGE_MS) expired.push(key);
		}
		for (const key of expired) storage.removeItem(key);
	} catch {
		// Pruning is opportunistic.
	}
}

function rendererStorage(): ElicitationDraftStorage | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function isDraftValue(value: unknown): value is ElicitationDraftValue {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
