/** Lifecycle of a self-update, pushed to the renderer as it progresses. */
export type DesktopUpdateStatus =
	| { state: 'idle' }
	| { state: 'checking' }
	| { state: 'available'; version: string }
	| { state: 'none' }
	| { state: 'downloading'; percent: number }
	| { state: 'error'; message: string };

/** Why moving the install didn't start (`moving` means the app is about to quit). */
export type DesktopMoveResult =
	'moving' | 'cancelled' | 'inside' | 'not-empty' | 'not-writable' | 'unavailable';

/** A Discord Rich Presence snapshot the renderer pushes to the desktop shell.
 *  Desktop-only: ignored in a browser, and a no-op unless the app was built with
 *  a Discord client id and Discord is actually running. */
export interface DesktopPresence {
	/** First line in Discord - the activity (a scene label, or "Playing"). */
	details: string;
	/** Second line - usually the map as "artist - title [version]". */
	state?: string;
	smallImage?: string;
	/** Epoch ms the activity began; drives Discord's "elapsed" timer. */
	startedAt?: number;
}

/** In-app self-update (electron-updater under the hood). User-initiated: the
 *  renderer checks when it learns a newer build shipped, then offers to download
 *  and restart. No-ops in an unpackaged/dev build. */
export interface DesktopUpdater {
	/** Ask the update feed whether a newer build exists; resolves to the outcome. */
	check(): Promise<DesktopUpdateStatus>;
	/** Download the available update (progress arrives via {@link onStatus}); resolves to the outcome. */
	download(): Promise<DesktopUpdateStatus>;
	/** Quit and install a downloaded update (relaunches into the new version). */
	install(): void;
	/** Subscribe to update lifecycle/progress; returns an unsubscribe fn. */
	onStatus(cb: (status: DesktopUpdateStatus) => void): () => void;
	/** Staging: the release streams on the LAN server, and this build's. */
	streams?(): Promise<{ current: string; streams: string[] }>;
	/** Staging: install another stream's latest build; the app restarts into it. */
	switchStream?(name: string): Promise<void>;
}

/** The player's maps, skins and add-ons, one folder each under a folder of their own. */
export type LibraryKind = 'maps' | 'skins' | 'addons';

/** One folder of the library: its files ('/' between folders, none starting with a dot)
 *  and what the game wrote about it in the folder's `.oss-idle.json`. */
export type LibraryEntry = {
	name: string;
	info?: unknown;
	files: { path: string; size: number }[];
};

/** A folder the player changed: its files `changed`, and `entry` undefined once it is gone. */
export type LibraryChange = {
	kind: LibraryKind;
	name: string;
	entry?: LibraryEntry;
	changed: string[];
};

/** Files by path; undefined deletes one. */
export type LibraryFiles = Record<string, Uint8Array | undefined>;

export type DesktopLibrary = {
	list(kind: LibraryKind): Promise<LibraryEntry[]>;
	read(kind: LibraryKind, name: string, path: string): Promise<Uint8Array | undefined>;
	/** Write files into the folder `name`, and its info when given. With `replace`, the
	 *  files not in `files` go. Resolves to the folder as it is now. */
	write(
		kind: LibraryKind, name: string, files: LibraryFiles, info?: unknown, replace?: boolean,
	): Promise<LibraryEntry>;
	remove(kind: LibraryKind, name: string): Promise<void>;
	/** Open the folder `name`, or the kind's own folder, in the file explorer. */
	reveal(kind: LibraryKind, name?: string): Promise<void>;
	/** What the player changes in the library folders; returns an unsubscribe fn. */
	onChanged(cb: (change: LibraryChange) => void): () => void;
};

/**
 * The bridge the Electron app injects on `window.ossIdleDesktop` (via its
 * preload, in every frame). Absent in a normal browser - {@link desktop} returns
 * null there, so all desktop-specific behaviour is opt-in and the web build is
 * unaffected. The desktop preload implements this exact shape.
 */
export interface OssIdleDesktop {
	readonly isDesktop: true;
	readonly version: string;
	/** In-app self-update controls. */
	readonly update: DesktopUpdater;
	/** Current session token for the socket handshake, or null when signed out (the
	 *  app adds it to API requests itself). Synchronous and cached. */
	getToken(): string | null;
	/** Begin osu! sign-in: opens the system browser to the OAuth flow. Resolves
	 *  once the round-trip completes (token stored) or rejects on failure/cancel. */
	login(): Promise<void>;
	/** Forget the stored session token (sign out). */
	logout(): Promise<void>;
	/** Subscribe to token changes (login / logout); returns an unsubscribe fn. */
	onAuthChanged(cb: (token: string | null) => void): () => void;
	/** Native window fullscreen - unlike the browser Fullscreen API it needs no
	 *  user gesture, so the persisted setting can be applied on boot. */
	setFullscreen(on: boolean): void;
	/** Chromium page zoom, which scales the whole UI the way browser zoom does.
	 *  Absent on desktop builds older than the UI scaling option. */
	setZoomFactor?(factor: number): void;
	/** Subscribe to window fullscreen changes (F11 / OS), so the setting stays
	 *  truthful; returns an unsubscribe fn. */
	onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void;
	/** Subscribe to the window being minimized or hidden and back; returns an
	 *  unsubscribe fn. Absent on desktop builds older than it. */
	onMinimizedChanged?(cb: (minimized: boolean) => void): () => void;
	/** Discord Rich Presence: reflect the current scene / playing map. Pass null
	 *  to clear. No-op when Discord isn't running or no client id was built in. */
	setPresence(presence: DesktopPresence | null): void;
	/** Subscribe to `oss-idle://` links the OS hands the app; returns an unsubscribe fn. */
	onDeepLink(cb: (link: string) => void): () => void;
	/** Staging: record ten seconds of Chromium's frame pipeline and send it to the
	 *  staging server; resolves to how that went. */
	trace?(): Promise<string>;
	/** Have the window wait, a few seconds at most, for `save` before it closes: the game
	 *  saves its database a moment after a write. Absent on builds older than it. */
	saveBeforeClose?(save: () => Promise<void>): void;
	/** Quit the desktop app immediately. The browser `window.close()` lingers in
	 *  Electron, so the renderer calls this for a snappy exit. No-op in a browser. */
	quit(): void;
	/** Chromium's vsync cap, which only a launch switch can lift. */
	readonly frameRate: {
		/** Whether this run was launched uncapped. */
		readonly uncapped: boolean;
		/** Persist whether the next launch is uncapped. */
		setUncapped(on: boolean): void;
	};
	/** Reinstall into `<picked folder>/oss!idle` and relaunch from there. Absent where the
	 *  install is already portable (AppImage, macOS) and on builds older than the option. */
	moveInstall?(dialogTitle: string): Promise<DesktopMoveResult>;
	/** Maps, skins and add-ons as folders on disk. Absent on builds older than it. */
	readonly library?: DesktopLibrary;
	/** Steam integration - inert until wired up, exposed so callers can feature-detect. */
	readonly steam: { readonly available: boolean };
}

declare global {
	interface Window {
		ossIdleDesktop?: OssIdleDesktop;
	}
}

/** The desktop bridge when running inside the Electron app, otherwise null. */
export function desktop(): OssIdleDesktop | null {
	return typeof window !== 'undefined' && window.ossIdleDesktop ? window.ossIdleDesktop : null;
}
