import fs from 'node:fs';
import path from 'node:path';

import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	shell,
} from 'electron';

// eslint-disable-next-line @stylistic/max-len
import type { DesktopPresence } from '@oss-idle/shared/desktop' with { 'resolution-mode': 'import' };

import {
	authorizeApiRequests,
	getToken,
	loadToken,
	logout,
	startLogin,
} from './auth';
import {
	DESKTOP_SCHEME,
	iconPath,
	IS_DEV,
	OTHER_INSTALL,
	RENDERER_URL,
	STAGING,
} from './config';
import { handleDeepLink } from './deeplink';
import { isAppFrame } from './frames';
import {
	canMoveInstall,
	finishMove,
	libraryRoot,
	moveInstall,
} from './install';
import {
	initLibrary,
	listLibrary,
	readLibrary,
	removeLibrary,
	revealLibrary,
	writeLibrary,
} from './library';
import {
	destroyPresence,
	initPresence,
	setPresence,
} from './presence';
import {
	registerAppProtocol,
	registerAppSchemePrivileges,
} from './protocol';
import { recordTrace } from './trace';
import {
	checkForUpdate,
	downloadUpdate,
	initUpdater,
	installUpdate,
	listStreams,
	switchStream,
} from './update';

// The data folder was named after the package before the rename to oss!idle. It
// holds the save and the session, so it moves over once, before anything opens it.
const USER_DATA = path.join(app.getPath('appData'), OTHER_INSTALL || 'oss!idle');
const LEGACY_USER_DATA = path.join(app.getPath('appData'), '@osu-idle', 'desktop');
if (!OTHER_INSTALL && !fs.existsSync(USER_DATA) && fs.existsSync(LEGACY_USER_DATA)) {
	try {
		fs.renameSync(LEGACY_USER_DATA, USER_DATA);
		fs.rmdirSync(path.dirname(LEGACY_USER_DATA));
	} catch (e) {
		console.error('[userData] move from the old folder failed', e);
	}
}
const stillLegacy = !OTHER_INSTALL && !fs.existsSync(USER_DATA) && fs.existsSync(LEGACY_USER_DATA);
app.setPath('userData', stillLegacy ? LEGACY_USER_DATA : USER_DATA);

// Privileges must be declared before the app is ready.
registerAppSchemePrivileges();

// a staging server is plain http on the LAN: let the secure app:// page reach it
if (STAGING) {
	const api = new URL(STAGING.api).origin;
	app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure',
		`${api},${api.replace(/^http/, 'ws')}`);
}

// The frame limiter's caps above the refresh rate (and Unlimited) need Chromium's
// vsync lifted, which only works as a launch switch: the renderer persists it here.
const UNCAPPED_FLAG = path.join(app.getPath('userData'), 'uncapped-fps');
const uncapped = fs.existsSync(UNCAPPED_FLAG);
if (uncapped) {
	app.commandLine.appendSwitch('disable-frame-rate-limit');
	app.commandLine.appendSwitch('disable-gpu-vsync');
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 1024,
		minHeight: 640,
		icon: iconPath(),
		backgroundColor: '#05040a',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			// run the preload (and thus the bridge) inside the same-origin /web
			// iframe too, so the in-game profile platform is Bearer-authed as well.
			nodeIntegrationInSubFrames: true,
			sandbox: false,
			// the entire reason for the desktop build: keep the gameplay clock,
			// render loop, and audio running while the window is unfocused/hidden.
			backgroundThrottling: false,
			// a real app, not a browser tab: let music start on the intro without a
			// click gate (the renderer auto-activates the intro when standalone).
			autoplayPolicy: 'no-user-gesture-required',
		},
	});

	// target='_blank' links (e.g. discord/github) must open in the player's real
	// browser, not a chromeless Electron window.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//.test(url)) void shell.openExternal(url);
		return { action: 'deny' };
	});

	void mainWindow.loadURL(RENDERER_URL);
	if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
	mainWindow.on('closed', () => { mainWindow = null; });
	mainWindow.on('close', saveBeforeClosing);
	// a dead renderer (GPU reset, out of memory) leaves a black window that takes no input
	mainWindow.webContents.on('render-process-gone', (_event, { reason }) => {
		if (reason !== 'clean-exit') mainWindow?.webContents.reload();
	});
	mainWindow.webContents.on('did-finish-load', () => {
		if (!pendingDeepLink) return;
		mainWindow?.webContents.send('oss-idle:deep-link', pendingDeepLink);
		pendingDeepLink = undefined;
	});
	// mirror native fullscreen changes (F11 / OS) back to the renderer so the
	// in-game setting stays truthful.
	mainWindow.on('enter-full-screen', 
		() => mainWindow?.webContents.send('oss-idle:fullscreen', true),
	);
	mainWindow.on('leave-full-screen', 
		() => mainWindow?.webContents.send('oss-idle:fullscreen', false),
	);
	// backgroundThrottling: false keeps the page "visible" when minimized, so it would
	// draw every frame no one sees: tell it, and it stops drawing
	const sendMinimized = () => {
		if (!mainWindow) return;
		const minimized = mainWindow.isMinimized() || !mainWindow.isVisible();
		mainWindow.webContents.send('oss-idle:minimized', minimized);
	};
	mainWindow.on('minimize', sendMinimized);
	mainWindow.on('restore', sendMinimized);
	mainWindow.on('hide', sendMinimized);
	mainWindow.on('show', sendMinimized);
}

/** the longest a closing window waits for the game's save */
const SAVE_WAIT_MS = 3000;
/** whether the loaded game asked to save before the window closes */
let savesOnClose = false;
let saved = false;

/** The game saves its database a moment after a write: a window that closes now asks it
 *  to save first, and closes once it did or SAVE_WAIT_MS passed. */
function saveBeforeClosing(event: Electron.Event): void {
	if (!savesOnClose || saved) return;
	event.preventDefault();
	let done = false;
	const close = () => {
		if (done) return;
		done = true;
		saved = true;
		mainWindow?.close();
	};
	ipcMain.once('oss-idle:saved', close);
	setTimeout(close, SAVE_WAIT_MS);
	mainWindow?.webContents.send('oss-idle:save');
}

/** A link that came before the game could take it (cold start), sent once it loads. */
let pendingDeepLink: string | undefined;

function sendDeepLink(link: string): void {
	const contents = mainWindow?.webContents;
	if (!contents || contents.isLoading()) {
		pendingDeepLink = link;
		return;
	}
	contents.send('oss-idle:deep-link', link);
}

function focusWindow(): void {
	if (!mainWindow) return;
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.focus();
}

/** A deep link (`oss-idle://...`) sitting in a process argv list, if any. */
function deepLinkFromArgv(argv: string[]): string | undefined {
	return argv.find(arg => arg.startsWith(`${DESKTOP_SCHEME}://`));
}

/** Register as the OS handler for the custom scheme. In dev, Electron is launched
 *  via the `electron` binary + our script path, so the handler must point back at
 *  exactly that for the OS to route the deep link to this instance. */
function registerProtocolClient(): void {
	if (process.defaultApp && process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(DESKTOP_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
	} else {
		app.setAsDefaultProtocolClient(DESKTOP_SCHEME);
	}
}

// Single-instance: a second launch (how Windows/Linux deliver a deep link)
// forwards its URL to the already-running app instead of starting a second one.
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', (_event, argv) => {
		const link = deepLinkFromArgv(argv);
		if (link) handleDeepLink(link, sendDeepLink);
		focusWindow();
	});

	// macOS delivers the deep link through this event rather than argv.
	app.on('open-url', (event, url) => {
		event.preventDefault();
		handleDeepLink(url, sendDeepLink);
		focusWindow();
	});

	void app.whenReady().then(() => {
		loadToken();
		authorizeApiRequests();
		// the oss-idle:// links stay the real game's
		if (!OTHER_INSTALL) registerProtocolClient();
		registerAppProtocol();

		// Bridge IPC. `bootstrap` is synchronous so the preload can seed the token
		// before the renderer's first API call (no signed-out flash on launch).
		ipcMain.on('oss-idle:bootstrap', event => {
			event.returnValue = isAppFrame(event.senderFrame)
				? {
					token: getToken(), version: app.getVersion(), uncapped, canMoveInstall,
				}
				: undefined;
		});
		ipcMain.handle('oss-idle:login', () => startLogin());
		ipcMain.handle('oss-idle:logout', () => { logout(); });
		ipcMain.on('oss-idle:set-fullscreen', (_event, on: boolean) => mainWindow?.setFullScreen(!!on));
		ipcMain.on('oss-idle:quit', () => app.quit());
		ipcMain.on('oss-idle:save-before-close', () => { savesOnClose = true; });
		ipcMain.handle('oss-idle:move-install',
			(_event, title: string) => moveInstall(mainWindow ?? undefined, String(title)),
		);
		ipcMain.on('oss-idle:set-uncapped', (_event, on: boolean) => {
			if (on) fs.writeFileSync(UNCAPPED_FLAG, '');
			else fs.rmSync(UNCAPPED_FLAG, { force: true });
		});

		// Self-update IPC. install ends the app, so it's fire-and-forget (send).
		initUpdater();
		ipcMain.handle('oss-idle:update-check', () => checkForUpdate());
		ipcMain.handle('oss-idle:update-download', () => downloadUpdate());
		ipcMain.on('oss-idle:update-install', () => installUpdate());
		ipcMain.handle('oss-idle:trace', () => recordTrace());
		ipcMain.handle('oss-idle:streams', () => listStreams());
		ipcMain.handle('oss-idle:switch-stream', (_event, name: string) => switchStream(String(name)));

		// Maps, skins and add-ons as folders on disk.
		finishMove();
		initLibrary(libraryRoot(), change =>
			mainWindow?.webContents.send('oss-idle:library-changed', change));
		const library: Record<string, (...args: never[]) => unknown> = {
			list: listLibrary,
			read: readLibrary,
			write: writeLibrary,
			remove: removeLibrary,
			reveal: revealLibrary,
		};
		ipcMain.handle('oss-idle:library', (event, op: string, ...args: unknown[]) =>
			(isAppFrame(event.senderFrame) && Object.hasOwn(library, op)
				? (library[op] as (...given: unknown[]) => unknown)(...args) : undefined));

		// Discord Rich Presence. The renderer pushes scene/map changes; the client
		// is self-healing, so this is fire-and-forget too.
		initPresence();
		ipcMain.on('oss-idle:presence', 
			(_event, presence: DesktopPresence | null) => setPresence(presence),
		);

		// Electron's default menu without its zoom: the game's rate shortcuts are Ctrl
		// with the two keys left of Backspace, which the menu takes for zoom
		Menu.setApplicationMenu(Menu.buildFromTemplate([
			{ role: 'fileMenu' },
			{ role: 'editMenu' },
			{
				label: 'View',
				submenu: [
					{ role: 'reload' },
					{ role: 'forceReload' },
					{ role: 'toggleDevTools' },
					{ role: 'togglefullscreen' },
				],
			},
			{ role: 'windowMenu' },
		]));

		createWindow();

		// A deep link passed on first launch (cold start via the protocol) rides in
		// this process's argv on Windows/Linux.
		const initial = deepLinkFromArgv(process.argv);
		if (initial) handleDeepLink(initial, sendDeepLink);

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});

	app.on('before-quit', () => destroyPresence());
}
