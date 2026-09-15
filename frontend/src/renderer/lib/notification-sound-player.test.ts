import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playNotificationSound } from "./notification-sound-player";

type FakeAudio = {
	listeners: Record<string, () => void>;
	play: () => Promise<void>;
};

describe("playNotificationSound", () => {
	const payload = { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" };
	let audio: FakeAudio;
	let revoke: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		audio = { listeners: {}, play: () => Promise.resolve() };
		vi.stubGlobal(
			"Audio",
			class {
				addEventListener(name: string, listener: () => void) {
					audio.listeners[name] = listener;
				}
				play() {
					return audio.play();
				}
			},
		);
		revoke = vi.fn();
		vi.stubGlobal("URL", { createObjectURL: () => "blob:sound", revokeObjectURL: revoke });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("plays and releases the blob without reporting failure", async () => {
		const onFailure = vi.fn();
		playNotificationSound(payload, onFailure);
		await Promise.resolve();
		audio.listeners.ended();
		expect(revoke).toHaveBeenCalledTimes(1);
		expect(onFailure).not.toHaveBeenCalled();
	});

	it("reports once when play() rejects", async () => {
		audio.play = () => Promise.reject(new Error("NotSupportedError"));
		const onFailure = vi.fn();
		playNotificationSound(payload, onFailure);
		await Promise.resolve();
		await Promise.resolve();
		audio.listeners.error();
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(revoke).toHaveBeenCalledTimes(1);
	});

	it("reports when the bytes cannot be decoded", () => {
		const onFailure = vi.fn();
		playNotificationSound(payload, onFailure);
		audio.listeners.error();
		expect(onFailure).toHaveBeenCalledTimes(1);
	});

	it("reports when the renderer has no audio output at all", () => {
		vi.stubGlobal("Audio", undefined);
		const onFailure = vi.fn();
		playNotificationSound(payload, onFailure);
		expect(onFailure).toHaveBeenCalledTimes(1);
	});
});
