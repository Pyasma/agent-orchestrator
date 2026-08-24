import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("../lib/api-client", () => ({
	apiClient: { GET: getMock },
	apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useSessionDetectedPorts } from "./useSessionDetectedPorts";

function wrapper({ children }: { children: ReactNode }) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
	getMock.mockReset();
});

describe("useSessionDetectedPorts", () => {
	it("fetches the session's detected ports while active", async () => {
		getMock.mockResolvedValue({
			data: { sessionId: "sess-1", ports: [{ port: 3000, pid: 111, command: "node server.js" }] },
			error: undefined,
		});

		const { result } = renderHook(() => useSessionDetectedPorts("sess-1", true), { wrapper });

		await waitFor(() => expect(result.current).toEqual([{ port: 3000, pid: 111, command: "node server.js" }]));
		expect(getMock).toHaveBeenCalledWith("/api/v1/sessions/{sessionId}/preview/ports", {
			params: { path: { sessionId: "sess-1" } },
		});
	});

	it("returns an empty list rather than throwing when the scan finds nothing", async () => {
		getMock.mockResolvedValue({ data: { sessionId: "sess-1", ports: [] }, error: undefined });

		const { result } = renderHook(() => useSessionDetectedPorts("sess-1", true), { wrapper });

		await waitFor(() => expect(getMock).toHaveBeenCalled());
		expect(result.current).toEqual([]);
	});

	it("does not fetch when inactive or without a session id", () => {
		renderHook(() => useSessionDetectedPorts(undefined, true), { wrapper });
		renderHook(() => useSessionDetectedPorts("sess-1", false), { wrapper });

		expect(getMock).not.toHaveBeenCalled();
	});
});
