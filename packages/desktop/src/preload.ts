import {
	contextBridge,
	ipcRenderer,
	webFrame,
} from 'electron';

// shared is ESM and this preload compiles to CommonJS; the resolution-mode hint
// lets the type-only import resolve without making the whole package ESM (an
// ESM preload has extra Electron caveats we don't need on the auth path).
// eslint-disable-next-line object-curly-newline -- false positive from the import attribute
import type {
	DesktopMoveResult,
	DesktopPresence,
	DesktopUpdateStatus,
	LibraryChange,
	OssIdleDesktop,
} from '@oss-idle/shared/desktop' with { 'resolution-mode': 'import' };

/**
 * Runs in every frame (top window + the same-origin /web iframe). Exposes the
 * typed {@link OssIdleDesktop} bridge the renderer feature-detects via
 * `@oss-idle/shared/desktop`. The session token is seeded synchronously so the
 * very first API call already carries it, then kept live via a push from main.
 */

type Boot = {
	token: string | null;
	version: string;
	uncapped: boolean;
	canMoveInstall: boolean;
};

// undefined in a frame that is not the game's own: no bridge there
const sent = ipcRenderer.sendSync('oss-idle:bootstrap') as Boot | undefined;
const boot: Boot = sent ?? {
	token: null, version: '', uncapped: false, canMoveInstall: false,
};

let token: string | null = boot.token;
const listeners = new Set<(token: string | null) => void>();

ipcRenderer.on('oss-idle:auth-token', (_event, next: string | null) => {
	token = next;
	for (const cb of listeners) {
		try { cb(token); } catch (e) { console.error('[desktop] auth listener threw', e); }
	}
});

const updateListeners = new Set<(status: DesktopUpdateStatus) => void>();
ipcRenderer.on('oss-idle:update-status', (_event, status: DesktopUpdateStatus) => {
	for (const cb of updateListeners) {
		try { cb(status); } catch (e) { console.error('[desktop] update listener threw', e); }
	}
});

const fullscreenListeners = new Set<(on: boolean) => void>();
ipcRenderer.on('oss-idle:fullscreen', (_event, on: boolean) => {
	for (const cb of fullscreenListeners) {
		try { cb(on); } catch (e) { console.error('[desktop] fullscreen listener threw', e); }
	}
});

const deepLinkListeners = new Set<(link: string) => void>();
ipcRenderer.on('oss-idle:deep-link', (_event, link: string) => {
	for (const cb of deepLinkListeners) {
		try { cb(link); } catch (e) { console.error('[desktop] deep link listener threw', e); }
	}
});

const libraryListeners = new Set<(change: LibraryChange) => void>();
ipcRenderer.on('oss-idle:library-changed', (_event, change: LibraryChange) => {
	for (const cb of libraryListeners) {
		try { cb(change); } catch (e) { console.error('[desktop] library listener threw', e); }
	}
});

let saveBeforeClose: (() => Promise<void>) | undefined;
ipcRenderer.on('oss-idle:save', () => {
	void (saveBeforeClose?.() ?? Promise.resolve())
		.catch(e => console.error('[desktop] the save before closing failed', e))
		.finally(() => ipcRenderer.send('oss-idle:saved'));
});

const bridge: OssIdleDesktop = {
	isDesktop: true,
	version: boot.version,
	getToken: () => token,
	login: () => ipcRenderer.invoke('oss-idle:login'),
	logout: () => ipcRenderer.invoke('oss-idle:logout'),
	onAuthChanged: cb => {
		listeners.add(cb);
		return () => { listeners.delete(cb); };
	},
	setFullscreen: on => ipcRenderer.send('oss-idle:set-fullscreen', on),
	setZoomFactor: factor => webFrame.setZoomFactor(factor),
	setPresence: (presence: DesktopPresence | null) => ipcRenderer.send('oss-idle:presence', presence),
	quit: () => ipcRenderer.send('oss-idle:quit'),
	saveBeforeClose: save => {
		saveBeforeClose = save;
		ipcRenderer.send('oss-idle:save-before-close');
	},
	trace: () => ipcRenderer.invoke('oss-idle:trace'),
	onDeepLink: cb => {
		deepLinkListeners.add(cb);
		return () => { deepLinkListeners.delete(cb); };
	},
	onFullscreenChanged: cb => {
		fullscreenListeners.add(cb);
		return () => { fullscreenListeners.delete(cb); };
	},
	update: {
		check: () => ipcRenderer.invoke('oss-idle:update-check'),
		download: () => ipcRenderer.invoke('oss-idle:update-download'),
		install: () => ipcRenderer.send('oss-idle:update-install'),
		streams: () => ipcRenderer.invoke('oss-idle:streams'),
		switchStream: name => ipcRenderer.invoke('oss-idle:switch-stream', name),
		onStatus: cb => {
			updateListeners.add(cb);
			return () => { updateListeners.delete(cb); };
		},
	},
	frameRate: {
		uncapped: boot.uncapped,
		setUncapped: on => ipcRenderer.send('oss-idle:set-uncapped', on),
	},
	...boot.canMoveInstall ? {
		moveInstall: (dialogTitle: string) =>
			ipcRenderer.invoke('oss-idle:move-install', dialogTitle) as Promise<DesktopMoveResult>,
	} : {},
	library: {
		list: kind => ipcRenderer.invoke('oss-idle:library', 'list', kind),
		read: (kind, name, file) => ipcRenderer.invoke('oss-idle:library', 'read', kind, name, file),
		write: (kind, name, files, info, replace) =>
			ipcRenderer.invoke('oss-idle:library', 'write', kind, name, files, info, replace),
		remove: (kind, name) => ipcRenderer.invoke('oss-idle:library', 'remove', kind, name),
		reveal: (kind, name) => ipcRenderer.invoke('oss-idle:library', 'reveal', kind, name),
		onChanged: cb => {
			libraryListeners.add(cb);
			return () => { libraryListeners.delete(cb); };
		},
	},
	steam: { available: false },
};

if (sent) contextBridge.exposeInMainWorld('ossIdleDesktop', bridge);
