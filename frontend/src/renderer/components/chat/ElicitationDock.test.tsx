import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aoBridge } from "../../lib/bridge";
import { elicitationDraftKey, readElicitationDraft, writeElicitationDraft } from "../../lib/elicitation-drafts";
import type { ConversationActivity } from "../../types/conversation";
import { ElicitationDock, elicitationFingerprint } from "./ElicitationDock";

function activity(detail: ConversationActivity["detail"]): ConversationActivity {
	return {
		kind: "activity",
		id: "question-1",
		sequence: 1,
		revision: 0,
		activityKind: "user_input",
		status: "pending",
		summary: "Choose a direction",
		requestId: "request-1",
		detail,
		createdAt: "2026-08-04T00:00:00Z",
	};
}

describe("ElicitationDock", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	const claudeQuestions = {
		type: "object" as const,
		required: ["question_0", "question_1"],
		properties: {
			question_0: {
				type: "string",
				title: "Approach",
				oneOf: [
					{ const: "Native", title: "Native", description: "Use ACP directly" },
					{ const: "Bridge", title: "Bridge" },
				],
			},
			question_0_custom: { type: "string", title: "Other approach" },
			question_1: {
				type: "string",
				title: "Language",
				oneOf: [
					{ const: "Go", title: "Go" },
					{ const: "TypeScript", title: "TypeScript" },
				],
			},
			question_1_custom: { type: "string", title: "Other language" },
		},
	};

	it("shows one Claude question and its Other field at a time", () => {
		render(
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				onResolve={vi.fn()}
			/>,
		);

		expect(screen.getByRole("group", { name: /Approach/ })).toBeInTheDocument();
		expect(screen.getByLabelText("Other approach")).toBeInTheDocument();
		expect(screen.queryByRole("group", { name: /Language/ })).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Other language")).not.toBeInTheDocument();
	});

	it("validates the active Claude question before moving forward", async () => {
		const user = userEvent.setup();
		render(
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				onResolve={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByText("Choose an answer.")).toBeInTheDocument();
		expect(screen.queryByRole("group", { name: /Language/ })).not.toBeInTheDocument();
	});

	it("navigates Claude questions and preserves answers when going back", async () => {
		const user = userEvent.setup();
		render(
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				onResolve={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.type(screen.getByLabelText("Other approach"), "Hybrid");
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByRole("group", { name: /Language/ })).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByRole("radio", { name: /Native/ })).toBeChecked();
		expect(screen.getByLabelText("Other approach")).toHaveValue("Hybrid");
	});

	it("submits all Claude answers together from the final question", async () => {
		const user = userEvent.setup();
		const onResolve = vi.fn().mockResolvedValue(undefined);
		render(
			<ElicitationDock
				activity={activity({
					inputMode: "form",
					message: "Which implementation should we use?",
					schema: claudeQuestions,
				})}
				onResolve={onResolve}
			/>,
		);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.type(screen.getByLabelText("Other approach"), "Hybrid");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("radio", { name: "Go" }));
		await user.type(screen.getByLabelText("Other language"), "Rust");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(onResolve).toHaveBeenCalledWith("request-1", "accept", {
			question_0: "Native",
			question_0_custom: "Hybrid",
			question_1: "Go",
			question_1_custom: "Rust",
		});
	});

	it("restores a typed custom answer after the dock is unmounted and remounted", async () => {
		const user = userEvent.setup();
		const dock = (
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				sessionId="session-1"
				onResolve={vi.fn()}
			/>
		);
		const first = render(dock);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.type(screen.getByLabelText("Other approach"), "Hybrid");
		// Switching sessions unmounts the whole Chat surface.
		first.unmount();

		render(dock);
		expect(screen.getByRole("radio", { name: /Native/ })).toBeChecked();
		expect(screen.getByLabelText("Other approach")).toHaveValue("Hybrid");
	});

	it("restores the question the human had reached", async () => {
		const user = userEvent.setup();
		const dock = (
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				sessionId="session-1"
				onResolve={vi.fn()}
			/>
		);
		const first = render(dock);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.click(screen.getByRole("button", { name: "Next" }));
		first.unmount();

		render(dock);
		expect(screen.getByRole("group", { name: /Language/ })).toBeInTheDocument();
	});

	it("drops the draft once the question is answered", async () => {
		const user = userEvent.setup();
		const dock = (
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				sessionId="session-1"
				onResolve={vi.fn().mockResolvedValue(undefined)}
			/>
		);
		const first = render(dock);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.type(screen.getByLabelText("Other approach"), "Hybrid");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("radio", { name: "Go" }));
		await user.click(screen.getByRole("button", { name: "Continue" }));
		first.unmount();

		render(dock);
		expect(screen.getByLabelText("Other approach")).toHaveValue("");
		expect(screen.getByRole("radio", { name: /Native/ })).not.toBeChecked();
	});

	it("starts a replacing question from scratch instead of inheriting answers", async () => {
		const user = userEvent.setup();
		const first = activity({ inputMode: "form", schema: claudeQuestions });
		const view = render(<ElicitationDock activity={first} sessionId="session-1" onResolve={vi.fn()} />);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.type(screen.getByLabelText("Other approach"), "Hybrid");

		// A second question arrives in the same dock, without it unmounting.
		view.rerender(
			<ElicitationDock
				activity={{ ...first, id: "question-2", requestId: "request-2" }}
				sessionId="session-1"
				onResolve={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText("Other approach")).toHaveValue("");
		expect(screen.getByRole("radio", { name: /Native/ })).not.toBeChecked();
		const secondFingerprint = elicitationFingerprint({ ...first, id: "question-2", requestId: "request-2" });
		expect(readElicitationDraft("session-1", "request-2", secondFingerprint)?.values.question_0_custom).toBeUndefined();
	});

	it("stores nothing for a question that was only shown", () => {
		const shown = activity({ inputMode: "form", schema: claudeQuestions });
		const view = render(<ElicitationDock activity={shown} sessionId="session-1" onResolve={vi.fn()} />);
		view.unmount();

		expect(readElicitationDraft("session-1", "request-1", elicitationFingerprint(shown))).toBeUndefined();
	});

	it("does not restore going Back with no other edits, so reopening lands on the later question", async () => {
		const user = userEvent.setup();
		const dock = (
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				sessionId="session-1"
				onResolve={vi.fn()}
			/>
		);
		const first = render(dock);

		await user.click(screen.getByRole("radio", { name: /Native/ }));
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Back" }));
		first.unmount();

		render(dock);
		expect(screen.getByRole("group", { name: /Approach/ })).toBeInTheDocument();
	});

	it("ignores a draft left by an earlier question that reused the same request id", async () => {
		const shown = activity({ inputMode: "form", schema: claudeQuestions });
		writeElicitationDraft(
			"session-1",
			"request-1",
			{ values: { question_0: "Bridge", question_0_custom: "leftover from an old question" }, activeQuestion: 1 },
			"a-different-question's-fingerprint",
		);

		render(<ElicitationDock activity={shown} sessionId="session-1" onResolve={vi.fn()} />);

		expect(screen.getByRole("radio", { name: /Native/ })).not.toBeChecked();
		expect(screen.getByRole("radio", { name: /Bridge/ })).not.toBeChecked();
		expect(screen.getByRole("group", { name: /Approach/ })).toBeInTheDocument();
		// The foreign entry is discarded outright rather than left for a future match.
		expect(window.localStorage.getItem(elicitationDraftKey("session-1", "request-1"))).toBeNull();
	});

	it("clamps a restored question index that no longer fits the question set", () => {
		const shown = activity({ inputMode: "form", schema: claudeQuestions });
		writeElicitationDraft(
			"session-1",
			"request-1",
			{ values: { question_0: "Native" }, activeQuestion: 99 },
			elicitationFingerprint(shown),
		);

		render(<ElicitationDock activity={shown} sessionId="session-1" onResolve={vi.fn()} />);

		// Falls back to the last real question, not to every field shown at once.
		expect(screen.getByRole("group", { name: /Language/ })).toBeInTheDocument();
	});

	it("keeps generic MCP forms in the all-fields layout", () => {
		render(
			<ElicitationDock
				activity={activity({
					inputMode: "form",
					schema: {
						type: "object",
						properties: {
							name: { type: "string", title: "Name" },
							team: { type: "string", title: "Team" },
						},
					},
				})}
				onResolve={vi.fn()}
			/>,
		);

		expect(screen.getByLabelText("Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Team")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
	});

	it("keeps required fields actionable instead of sending an invalid form", async () => {
		const user = userEvent.setup();
		const onResolve = vi.fn();
		render(
			<ElicitationDock
				activity={activity({
					inputMode: "form",
					schema: {
						type: "object",
						required: ["name"],
						properties: { name: { type: "string", title: "Name" } },
					},
				})}
				onResolve={onResolve}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(screen.getByText("This field is required.")).toBeInTheDocument();
		expect(onResolve).not.toHaveBeenCalled();
	});

	it("gives an invalid boolean the error node its aria-describedby names", async () => {
		const user = userEvent.setup();
		const onResolve = vi.fn();
		render(
			<ElicitationDock
				activity={activity({
					inputMode: "form",
					schema: {
						type: "object",
						required: ["diagnostics"],
						properties: { diagnostics: { type: "boolean", title: "Share diagnostics" } },
					},
				})}
				onResolve={onResolve}
			/>,
		);

		const checkbox = screen.getByRole("checkbox", { name: /Share diagnostics/ });
		expect(checkbox).not.toHaveAttribute("aria-describedby");

		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(onResolve).not.toHaveBeenCalled();

		// A description that points at nothing reads as an unlabelled error to a
		// screen reader, so the target has to exist and carry the wording.
		const describedBy = checkbox.getAttribute("aria-describedby") ?? "";
		expect(describedBy).not.toBe("");
		expect(document.getElementById(describedBy)).toHaveTextContent("This field is required.");
	});

	it("names the Other row with a visible label rather than a placeholder", () => {
		render(
			<ElicitationDock
				activity={activity({ inputMode: "form", schema: claudeQuestions })}
				onResolve={vi.fn()}
			/>,
		);

		// DESIGN.md §9: a placeholder is an example, never the only name a field has.
		const other = screen.getByLabelText("Other approach");
		expect(other).not.toHaveAttribute("placeholder");
		expect(screen.getByText("Other approach")).toBeVisible();
	});

	it("opens an external URL only after the user explicitly consents", async () => {
		const user = userEvent.setup();
		const openExternal = vi.spyOn(aoBridge.app, "openExternal").mockResolvedValue(undefined);
		const onResolve = vi.fn().mockResolvedValue(undefined);
		render(
			<ElicitationDock
				activity={activity({ inputMode: "url", url: "https://console.anthropic.com/oauth", message: "Sign in" })}
				onResolve={onResolve}
			/>,
		);
		expect(openExternal).not.toHaveBeenCalled();
		expect(screen.getByText("https://console.anthropic.com/oauth")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open console.anthropic.com" }));
		expect(openExternal).toHaveBeenCalledWith("https://console.anthropic.com/oauth");
		expect(onResolve).toHaveBeenCalledWith("request-1", "accept", undefined);
	});

	it("refuses unsafe URL schemes", () => {
		render(
			<ElicitationDock
				activity={activity({ inputMode: "url", url: "file:///Users/alice/.ssh/id_rsa" })}
				onResolve={vi.fn()}
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/unsafe or invalid URL/i);
		expect(screen.getByRole("button", { name: "Open link" })).toBeDisabled();
	});
});
