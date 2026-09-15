// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	MAX_NOTIFICATION_SOUND_BYTES,
	NOTIFICATION_SOUND_DIR_NAME,
	NotificationSoundImportError,
	clearNotificationSound,
	importNotificationSound,
	pruneNotificationSounds,
	resolveManagedNotificationSoundPath,
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

	it("keeps the previous sound until the caller prunes after persisting the new path", async () => {
		await importNotificationSound(stateDir, await writeSource("one.mp3", "a"));
		const second = await importNotificationSound(stateDir, await writeSource("two.ogg", "b"));
		expect((await readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).sort()).toEqual(["one.mp3", "two.ogg"]);
		await pruneNotificationSounds(stateDir, second);
		expect(await readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).toEqual(["two.ogg"]);
		// Nothing to prune is not an error.
		await clearNotificationSound(stateDir);
		await expect(pruneNotificationSounds(stateDir, second)).resolves.toBeUndefined();
	});

	it("replaces a same-named sound atomically and leaves no temp file behind", async () => {
		const first = await importNotificationSound(stateDir, await writeSource("ding.wav", "old"));
		const second = await importNotificationSound(stateDir, await writeSource("ding.wav", "new"));
		expect(second).toBe(first);
		expect(await readFile(second, "utf8")).toBe("new");
		expect(await readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).toEqual(["ding.wav"]);
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

	it("refuses to read a sound outside the managed directory, including through a symlink", async () => {
		const managed = path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME);
		const outside = await writeSource("outside.mp3", "leak");
		expect(await resolveManagedNotificationSoundPath(stateDir, outside)).toBeNull();
		expect(await resolveManagedNotificationSoundPath(stateDir, path.join(managed, "..", "ui-settings.json"))).toBeNull();

		const imported = await importNotificationSound(stateDir, await writeSource("ding.mp3", "ok"));
		expect(await resolveManagedNotificationSoundPath(stateDir, managed)).toBeNull();
		expect(await resolveManagedNotificationSoundPath(stateDir, imported)).toBe(imported);

		await symlink(outside, path.join(managed, "link.mp3"));
		expect(await resolveManagedNotificationSoundPath(stateDir, path.join(managed, "link.mp3"))).toBeNull();
		expect(await readNotificationSound(stateDir, path.join(managed, "link.mp3"))).toBeNull();
		expect(await readNotificationSound(stateDir, outside)).toBeNull();
	});

	it("refuses to read a managed file over the size cap", async () => {
		const imported = await importNotificationSound(stateDir, await writeSource("ok.wav", "ok"));
		await writeFile(imported, new Uint8Array(MAX_NOTIFICATION_SOUND_BYTES + 1));
		expect(await readNotificationSound(stateDir, imported)).toBeNull();
	});

	it("clears the imported sound and tolerates nothing being there", async () => {
		await importNotificationSound(stateDir, await writeSource("one.mp3", "a"));
		await clearNotificationSound(stateDir);
		await expect(readdir(path.join(stateDir, NOTIFICATION_SOUND_DIR_NAME))).rejects.toThrow();
		await expect(clearNotificationSound(stateDir)).resolves.toBeUndefined();
	});
});
