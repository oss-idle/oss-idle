import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

/** Custom scheme the OS routes back to the running app (`oss-idle://<action>`) -
 *  must match electron-builder's `protocols`. The transport for app-directed deep
 *  links (see deeplink.ts); auth no longer uses it. */
export const DESKTOP_SCHEME = 'oss-idle';

/** Local scheme the renderer bundle is served from. A registered standard +
 *  secure scheme gives a stable, secure origin (so IndexedDB persists and
 *  AudioContext / crypto.subtle work) - far better behaved than `file://`. Must
 *  match the server's `DESKTOP_ORIGIN`. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'idle';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Discord application id for Rich Presence. Create an app at
 *  https://discord.com/developers/applications, upload an art asset named to
 *  match {@link DISCORD_LARGE_IMAGE}, and paste the Application ID here. Leave
 *  empty to disable presence entirely (it then no-ops everywhere). */
export const DISCORD_CLIENT_ID = '1517803750968918037';

/** Key of the large image asset uploaded to the Discord app (Rich Presence →
 *  Art Assets). The only Discord-specific art the renderer never has to know. */
export const DISCORD_LARGE_IMAGE = 'idle-white';

/** Dev: not packaged → talk to the local server and load the running Vite client.
 *  Prod: the public API and the bundled app:// origin. */
export const IS_DEV = !app.isPackaged;

/** A staging build: packaged like prod, but its package.json (written by the build)
 *  names a staging server for the API and the website. */
const META = JSON.parse(
	fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'),
) as {
	staging?: { api: string; site: string; stream?: string; streams?: string };
	pbe?: { api: string; site: string };
};
export const STAGING = META.staging;

/** A PBE build: a release in all but its server, written by its build like staging's. */
export const PBE = META.pbe;

/** A separate install beside the real game: its own save, and no oss-idle:// links. */
export const OTHER_INSTALL = STAGING ? 'oss!idle staging' : PBE && 'oss!idle PBE';

/** Backend API base (absolute - the renderer loads from app://, not the API). */
export const API_BASE = IS_DEV
	? 'http://localhost:3873'
	: STAGING?.api ?? PBE?.api ?? 'https://api.oss.idle.rhythmgamers.net';

/** What the main window loads: the live Vite dev server, or the bundled origin. */
export const RENDERER_URL = IS_DEV ? 'http://localhost:5173/' : `${APP_ORIGIN}/`;

/** The website origin (the signed-in page after a desktop login). */
export const SITE_BASE = STAGING?.site ?? PBE?.site ?? 'https://oss.idle.rhythmgamers.net';

/** On-disk root of a bundled renderer ('client' or 'web'). Packaged: copied under
 *  resources/renderer (see electron-builder `extraResources`). Unpackaged: each
 *  package's own `dist` (so a prod-origin run works without packaging). */
export function rendererDir(kind: 'client' | 'web'): string {
	if (app.isPackaged) return path.join(process.resourcesPath, 'renderer', kind);
	return path.join(__dirname, '..', '..', kind, 'dist');
}

/** The running window's icon. Packaged: shipped to resources root (see
 *  electron-builder `extraResources`). Unpackaged: the source PNG. */
export function iconPath(): string {
	if (app.isPackaged) return path.join(process.resourcesPath, 'icon.png');
	return path.join(__dirname, '..', '..', 'web', 'public', 'idle-white.png');
}
