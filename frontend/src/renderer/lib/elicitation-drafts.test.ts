import { beforeEach, describe, expect, it } from "vitest";
import {
	clearElicitationDraft,
	elicitationDraftKey,
	pruneExpiredElicitationDrafts,
	pruneExpiredElicitationDraftsOnce,
	readElicitationDraft,
	resetElicitationDraftPruning,
	writeElicitationDraft,
} from "./elicitation-drafts";

const FP = "question-fingerprint";

describe("elicitation drafts", () => {
	beforeEach(() => {
		window.localStorage.clear();
		resetElicitationDraftPruning();
	});

	/** Enumerable stand-in: the shared test stub has no key()/length. */
	function enumerableStorage() {
		const values = new Map<string, string>();
		return {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => void values.set(key, value),
			removeItem: (key: string) => void values.delete(key),
			key: (index: number) => [...values.keys()][index] ?? null,
			get length() {
				return values.size;
			},
		};
	}

	it("round-trips an in-progress answer", () => {
		writeElicitationDraft(
			"session-1",
			"request-1",
			{ values: { question_0: "Native", question_0_custom: "Hybrid", picks: ["a", "b"] }, activeQuestion: 1 },
			FP,
		);

		expect(readElicitationDraft("session-1", "request-1", FP)).toEqual({
			values: { question_0: "Native", question_0_custom: "Hybrid", picks: ["a", "b"] },
			activeQuestion: 1,
		});
	});

	it("scopes drafts to one session and request", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, FP);

		expect(readElicitationDraft("session-2", "request-1", FP)).toBeUndefined();
		expect(readElicitationDraft("session-1", "request-2", FP)).toBeUndefined();
	});

	it("clears a resolved question", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, FP);
		clearElicitationDraft("session-1", "request-1");

		expect(readElicitationDraft("session-1", "request-1", FP)).toBeUndefined();
	});

	it("ignores unreadable or foreign payloads", () => {
		window.localStorage.setItem(elicitationDraftKey("session-1", "request-1"), "not json");
		expect(readElicitationDraft("session-1", "request-1", FP)).toBeUndefined();

		window.localStorage.setItem(
			elicitationDraftKey("session-1", "request-2"),
			JSON.stringify({ schemaVersion: 99, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now(), fingerprint: FP }),
		);
		expect(readElicitationDraft("session-1", "request-2", FP)).toBeUndefined();
	});

	it("drops values the schema could never hold", () => {
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "request-1"),
			JSON.stringify({
				schemaVersion: 1,
				values: { good: "yes", bad: { nested: true } },
				activeQuestion: 0,
				updatedAt: Date.now(),
				fingerprint: FP,
			}),
		);

		expect(readElicitationDraft("session-1", "request-1", FP)?.values).toEqual({ good: "yes" });
	});

	it("refuses a draft written for a different question, even with a matching request id", () => {
		// The legacy ACP transport reuses request ids from a per-process counter
		// that restarts with the agent, so a matching id alone proves nothing.
		writeElicitationDraft("session-1", "request-1", { values: { answer: "old question's answer" }, activeQuestion: 0 }, FP);

		expect(readElicitationDraft("session-1", "request-1", "a-different-question")).toBeUndefined();
		// The mismatched entry is discarded, not left to resurface later under the right fingerprint.
		expect(window.localStorage.getItem(elicitationDraftKey("session-1", "request-1"))).toBeNull();
	});

	it("prunes drafts left behind by questions that were never resolved", () => {
		const storage = enumerableStorage();
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		storage.setItem(
			elicitationDraftKey("session-1", "stale"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() - eightDays, fingerprint: FP }),
		);
		writeElicitationDraft("session-1", "fresh", { values: { a: "two" }, activeQuestion: 0 }, FP, storage);

		pruneExpiredElicitationDrafts(storage);

		expect(readElicitationDraft("session-1", "stale", FP, storage)).toBeUndefined();
		expect(readElicitationDraft("session-1", "fresh", FP, storage)?.values).toEqual({ a: "two" });
	});

	it("does not keep writing while the human types", () => {
		const storage = enumerableStorage();
		let reads = 0;
		const counted = { ...storage, getItem: (key: string) => (reads++, storage.getItem(key)) };

		writeElicitationDraft("session-1", "request-1", { values: { a: "o" }, activeQuestion: 0 }, FP, counted);
		writeElicitationDraft("session-1", "request-1", { values: { a: "on" }, activeQuestion: 0 }, FP, counted);
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, FP, counted);

		// Writing must not walk the store; only the explicit sweep reads every key.
		expect(reads).toBe(0);
	});

	it("sweeps only once per renderer run", () => {
		const storage = enumerableStorage();
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, FP, storage);
		let keyCalls = 0;
		const counted = { ...storage, key: (index: number) => (keyCalls++, storage.key(index)) };

		pruneExpiredElicitationDraftsOnce(counted);
		pruneExpiredElicitationDraftsOnce(counted);
		pruneExpiredElicitationDraftsOnce(counted);

		// One key in the store: the first call walks it once, later calls must not walk again.
		expect(keyCalls).toBe(1);
	});

	it("refuses to restore a stale draft even if no write ever prunes it", () => {
		// No prune of any kind runs in this test — proves the read path itself
		// enforces the seven-day expiry instead of relying on the sweep.
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "stale"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() - eightDays, fingerprint: FP }),
		);

		expect(readElicitationDraft("session-1", "stale", FP)).toBeUndefined();
		// The stale entry is also removed as a side effect, so a later sweep has nothing to do.
		expect(window.localStorage.getItem(elicitationDraftKey("session-1", "stale"))).toBeNull();
	});

	it("refuses a draft with no, non-numeric, or future-dated updatedAt", () => {
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "missing-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, fingerprint: FP }),
		);
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "bad-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: "yesterday", fingerprint: FP }),
		);
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "future-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() + 60_000, fingerprint: FP }),
		);

		expect(readElicitationDraft("session-1", "missing-timestamp", FP)).toBeUndefined();
		expect(readElicitationDraft("session-1", "bad-timestamp", FP)).toBeUndefined();
		expect(readElicitationDraft("session-1", "future-timestamp", FP)).toBeUndefined();
	});

	it("still restores a draft that is fresh but was never swept", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, FP);

		expect(readElicitationDraft("session-1", "request-1", FP)?.values).toEqual({ a: "one" });
	});
});
