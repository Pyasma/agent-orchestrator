// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readdir, rm, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	MAX_NOTIFICATION_SOUND_BYTES,
	NOTIFICATION_SOUND_DIR_NAME,
	NotificationSoundImportError,
	clearNotificationSound,
	importNotificationSound,
	isManagedNotificationSoundPath,
	notificationSoundMimeType,
	readNotificationSound,
} from "./notification-sound";

describe("notification-sound", () => {
	let stateDir: string;
	let sourceDir: string;
	beforeEach(async () => {
		stateDir = await mkdtemp(path.join(os.tmpdir(), "ao-sound-state-"));
		sourceDir = await mkdtemp(path.join(os.tmpdir(), "ao-sound-src-"));
	});
	afterEach(async () => {
		await rm(stateDir, { recursive: true, force: true });
		await rm(sourceDir, { recursive: true, force: true });
	});

	async function writeSource(name: string, bytes: Uint8Array | string): Promise<string> {
		const file = path.join(sourceDir, name);
		await writeFile(file, bytes);
		return file;
	}

	it("maps supported extensions to MIME types case-insensitively", () => {
		expect(notificationSoundMimeType("/x/ding.mp3")).toBe("audio/mpeg");
		expect(notificationSoundMimeType("/x/DING.WAV")).toBe("audio/wav");
		expect(notificationSoundMimeType("/x/ding.txt")).toBeNull();
		expect(notificationSoundMimeType("/x/ding")).toBeNull();
	});

	it("copies the chosen file under the state dir and keeps its name", async () => {
		const source = await writeSource("ding.wav", new Uint8Array([1, 2, 3]));
		const copied = await importNotificationSound(stateDir, source);
		expect(copied).toBe(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME, "ding.wav"));
		expect((await stat(copied)).size).toBe(3);

		// The original is no longer needed once imported.
		await rm(source);
		expect(await readNotificationSound(stateDir, copied)).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });
	});

	it("replaces a previously imported sound instead of accumulating files", async () => {
		await importNotificationSound(stateDir, await writeSource("one.mp3", "a"));
		await importNotificationSound(stateDir, await writeSource("two.ogg", "b"));
		expect(await readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).toEqual(["two.ogg"]);
	});

	it("rejects unsupported formats before touching the state dir", async () => {
		const source = await writeSource("notes.txt", "hello");
		await expect(importNotificationSound(stateDir, source)).rejects.toMatchObject({ code: "unsupported_type" });
		await expect(readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).rejects.toThrow();
	});

	it("rejects files over the size cap", async () => {
		const source = await writeSource("huge.wav", new Uint8Array(MAX_NOTIFICATION_SOUND_BYTES + 1));
		await expect(importNotificationSound(stateDir, source)).rejects.toBeInstanceOf(NotificationSoundImportError);
		await expect(importNotificationSound(stateDir, source)).rejects.toMatchObject({ code: "too_large" });
	});

	it("reports a missing source as unreadable", async () => {
		await expect(importNotificationSound(stateDir, path.join(sourceDir, "gone.mp3"))).rejects.toMatchObject({
			code: "unreadable",
		});
	});

	it("keeps the previous sound when copying the replacement fails", async () => {
		const first = await importNotificationSound(stateDir, await writeSource("one.mp3", "a"));
		// A directory passes the extension check but is not a regular file.
		const unreadable = path.join(sourceDir, "two.ogg");
		await mkdir(unreadable);
		await expect(importNotificationSound(stateDir, unreadable)).rejects.toMatchObject({ code: "unreadable" });
		expect(await readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).toEqual([path.basename(first)]);
	});

	it("reads null for no sound, a vanished file, or an unsupported path so callers fall back to the beep", async () => {
		expect(await readNotificationSound(stateDir, null)).toBeNull();
		expect(await readNotificationSound(stateDir, path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME, "missing.mp3"))).toBeNull();
		const imported = await importNotificationSound(stateDir, await writeSource("x.wav", "ok"));
		await writeFile(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME, "x.txt"), "nope");
		expect(await readNotificationSound(stateDir, imported.replace(/x\.wav$/, "x.txt"))).toBeNull();
	});

	it("refuses to read a sound outside the managed directory", async () => {
		const outside = await writeSource("outside.mp3", "leak");
		expect(isManagedNotificationSoundPath(stateDir, outside)).toBe(false);
		expect(isManagedNotificationSoundPath(stateDir, path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).toBe(false);
		expect(isManagedNotificationSoundPath(stateDir, path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME, "..", "ui-settings.json"))).toBe(
			false,
		);
		expect(isManagedNotificationSoundPath(stateDir, path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME, "ding.mp3"))).toBe(true);
		expect(await readNotificationSound(stateDir, outside)).toBeNull();
	});

	it("clears the imported sound and tolerates nothing being there", async () => {
		await importNotificationSound(stateDir, await writeSource("one.mp3", "a"));
		await clearNotificationSound(stateDir);
		await expect(readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).rejects.toThrow();
		await expect(clearNotificationSound(stateDir)).resolves.toBeUndefined();
	});
});
