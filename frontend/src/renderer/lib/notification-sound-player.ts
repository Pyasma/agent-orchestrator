import type { NotificationSoundPayload } from "../../shared/notification-sound";

/**
 * Play a custom notification sound shipped from the main process. Electron's
 * main process has no audio output, so it sends the file bytes here and the
 * renderer plays them through an `<audio>` element.
 *
 * Playback never surfaces as a UI error, but it is not silent either: when the
 * bytes cannot be decoded or `play()` rejects, `onFailure` runs (once) so main
 * can fall back to the system beep for this notification.
 */
export function playNotificationSound(payload: NotificationSoundPayload, onFailure: () => void): void {
	if (typeof Audio === "undefined" || typeof URL.createObjectURL !== "function") {
		onFailure();
		return;
	}
	const url = URL.createObjectURL(new Blob([payload.bytes], { type: payload.mimeType }));
	const audio = new Audio(url);
	let settled = false;
	const release = () => URL.revokeObjectURL(url);
	const fail = () => {
		if (settled) return;
		settled = true;
		release();
		onFailure();
	};
	audio.addEventListener(
		"ended",
		() => {
			settled = true;
			release();
		},
		{ once: true },
	);
	audio.addEventListener("error", fail, { once: true });
	audio.play().catch(fail);
}
