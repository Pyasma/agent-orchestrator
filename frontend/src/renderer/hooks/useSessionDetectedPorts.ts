import { useQuery } from "@tanstack/react-query";
import type { components } from "../../api/schema";
import { apiClient, apiErrorMessage } from "../lib/api-client";

export type DetectedPort = components["schemas"]["DetectedPort"];

export const sessionDetectedPortsQueryKey = (sessionId: string) => ["session-detected-ports", sessionId] as const;

async function fetchSessionDetectedPorts(sessionId: string): Promise<DetectedPort[]> {
	const { data, error } = await apiClient.GET("/api/v1/sessions/{sessionId}/preview/ports", {
		params: { path: { sessionId } },
	});
	if (error) throw new Error(apiErrorMessage(error, "Unable to load detected ports"));
	return data?.ports ?? [];
}

// A best-effort suggestion surface (see ports.DetectedPortLister on the
// backend), not a live push -- polls while the panel is active rather than
// subscribing to an event stream. Disabled entirely when inactive so a
// backgrounded tab does not keep scanning the host.
export function useSessionDetectedPorts(sessionId: string | undefined, active: boolean) {
	const query = useQuery({
		queryKey: sessionDetectedPortsQueryKey(sessionId ?? ""),
		queryFn: () => fetchSessionDetectedPorts(sessionId ?? ""),
		enabled: Boolean(sessionId) && active,
		refetchInterval: active ? 3_500 : false,
	});
	return query.data ?? [];
}
