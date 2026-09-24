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
		writeElicitationDraft("session-1", "request-1", {
			values: { question_0: "Native", question_0_custom: "Hybrid", picks: ["a", "b"] },
			activeQuestion: 1,
		});

		expect(readElicitationDraft("session-1", "request-1")).toEqual({
			values: { question_0: "Native", question_0_custom: "Hybrid", picks: ["a", "b"] },
			activeQuestion: 1,
		});
	});

	it("scopes drafts to one session and request", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 });

		expect(readElicitationDraft("session-2", "request-1")).toBeUndefined();
		expect(readElicitationDraft("session-1", "request-2")).toBeUndefined();
	});

	it("clears a resolved question", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 });
		clearElicitationDraft("session-1", "request-1");

		expect(readElicitationDraft("session-1", "request-1")).toBeUndefined();
	});

	it("ignores unreadable or foreign payloads", () => {
		window.localStorage.setItem(elicitationDraftKey("session-1", "request-1"), "not json");
		expect(readElicitationDraft("session-1", "request-1")).toBeUndefined();

		window.localStorage.setItem(
			elicitationDraftKey("session-1", "request-2"),
			JSON.stringify({ schemaVersion: 99, values: { a: "one" }, activeQuestion: 0 }),
		);
		expect(readElicitationDraft("session-1", "request-2")).toBeUndefined();
	});

	it("drops values the schema could never hold", () => {
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "request-1"),
			JSON.stringify({ schemaVersion: 1, values: { good: "yes", bad: { nested: true } }, activeQuestion: 0 }),
		);

		expect(readElicitationDraft("session-1", "request-1")?.values).toEqual({ good: "yes" });
	});

	it("prunes drafts left behind by questions that were never resolved", () => {
		const storage = enumerableStorage();
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		storage.setItem(
			elicitationDraftKey("session-1", "stale"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() - eightDays }),
		);
		writeElicitationDraft("session-1", "fresh", { values: { a: "two" }, activeQuestion: 0 }, storage);

		pruneExpiredElicitationDrafts(storage);

		expect(readElicitationDraft("session-1", "stale", storage)).toBeUndefined();
		expect(readElicitationDraft("session-1", "fresh", storage)?.values).toEqual({ a: "two" });
	});

	it("does not keep writing while the human types", () => {
		const storage = enumerableStorage();
		let reads = 0;
		const counted = { ...storage, getItem: (key: string) => (reads++, storage.getItem(key)) };

		writeElicitationDraft("session-1", "request-1", { values: { a: "o" }, activeQuestion: 0 }, counted);
		writeElicitationDraft("session-1", "request-1", { values: { a: "on" }, activeQuestion: 0 }, counted);
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 }, counted);

		// Writing must not walk the store; only the explicit sweep reads every key.
		expect(reads).toBe(0);
	});

	it("sweeps only once per renderer run", () => {
		const storage = enumerableStorage();
		let keyCalls = 0;
		const counted = { ...storage, key: (index: number) => (keyCalls++, storage.key(index)) };

		pruneExpiredElicitationDraftsOnce(counted);
		pruneExpiredElicitationDraftsOnce(counted);
		pruneExpiredElicitationDraftsOnce(counted);

		// A second and third call must not walk the store again.
		expect(keyCalls).toBe(1);
	});

	it("refuses to restore a stale draft even if no write ever prunes it", () => {
		// No prune of any kind runs in this test — proves the read path itself
		// enforces the seven-day expiry instead of relying on the sweep.
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "stale"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() - eightDays }),
		);

		expect(readElicitationDraft("session-1", "stale")).toBeUndefined();
		// The stale entry is also removed as a side effect, so a later sweep has nothing to do.
		expect(window.localStorage.getItem(elicitationDraftKey("session-1", "stale"))).toBeNull();
	});

	it("refuses a draft with no, non-numeric, or future-dated updatedAt", () => {
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "missing-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0 }),
		);
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "bad-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: "yesterday" }),
		);
		window.localStorage.setItem(
			elicitationDraftKey("session-1", "future-timestamp"),
			JSON.stringify({ schemaVersion: 1, values: { a: "one" }, activeQuestion: 0, updatedAt: Date.now() + 60_000 }),
		);

		expect(readElicitationDraft("session-1", "missing-timestamp")).toBeUndefined();
		expect(readElicitationDraft("session-1", "bad-timestamp")).toBeUndefined();
		expect(readElicitationDraft("session-1", "future-timestamp")).toBeUndefined();
	});

	it("still restores a draft that is fresh but was never swept", () => {
		writeElicitationDraft("session-1", "request-1", { values: { a: "one" }, activeQuestion: 0 });

		expect(readElicitationDraft("session-1", "request-1")?.values).toEqual({ a: "one" });
	});
});
