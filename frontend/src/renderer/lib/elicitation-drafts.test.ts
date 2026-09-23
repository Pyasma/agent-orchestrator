import { beforeEach, describe, expect, it } from "vitest";
import {
	clearElicitationDraft,
	pruneExpiredElicitationDraftsOnce,
	resetElicitationDraftPruning,
	elicitationDraftKey,
	pruneExpiredElicitationDrafts,
	readElicitationDraft,
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
		const eightDays = 8 * 24 * 60 * 60 * 1000;
		const stale = JSON.stringify({
			schemaVersion: 1,
			values: { a: "one" },
			activeQuestion: 0,
			updatedAt: Date.now() - eightDays,
		});
		storage.setItem(elicitationDraftKey("session-1", "stale"), stale);

		pruneExpiredElicitationDraftsOnce(storage);
		expect(readElicitationDraft("session-1", "stale", storage)).toBeUndefined();

		storage.setItem(elicitationDraftKey("session-1", "stale-2"), stale);
		pruneExpiredElicitationDraftsOnce(storage);
		expect(readElicitationDraft("session-1", "stale-2", storage)?.values).toEqual({ a: "one" });
	});
});
