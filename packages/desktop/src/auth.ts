import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import {
	app,
	safeStorage,
	session,
	shell,
} from 'electron';

import {
	API_BASE,
	DESKTOP_SCHEME,
	IS_DEV,
	SITE_BASE,
} from './config';
import { broadcast } from './frames';

/**
 * Desktop session handling. The osu! OAuth round-trip runs in the user's real
 * system browser (trusted chrome, password managers, no embedded-webview
 * friction). The app waits on its own loopback (RFC 8252): the server's callback
 * sends that browser to `127.0.0.1:<port>` with a one-time code, which only the
 * machine that signed in can receive, and the app swaps it for the session. The
 * token is then held here (encrypted on disk via {@link safeStorage}) and pushed
 * to every renderer frame for its socket; API requests get it as a `Bearer` header
 * here ({@link authorizeApiRequests}).
 */

const LOGIN_TIMEOUT_MS = 5 * 60_000;
const SIGNED_IN_PAGE = `${IS_DEV ? 'http://localhost:5173' : SITE_BASE}/web/auth/desktop?scheme=${DESKTOP_SCHEME}`;

let token: string | null = null;
// The in-flight login's listener: a newer login closes it.
let activeLogin: http.Server | null = null;

const tokenFile = () => path.join(app.getPath('userData'), 'session.bin');

/** Load any persisted session at startup. */
export function loadToken(): void {
	try {
		const buf = fs.readFileSync(tokenFile());
		token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
	} catch {
		token = null;
	}
}

function persist(): void {
	try {
		if (token === null) {
			fs.rmSync(tokenFile(), { force: true });
			return;
		}
		const buf = safeStorage.isEncryptionAvailable()
			? safeStorage.encryptString(token)
			: Buffer.from(token, 'utf8');
		fs.writeFileSync(tokenFile(), buf);
	} catch (e) {
		console.error('[auth] failed to persist session', e);
	}
}

export function getToken(): string | null {
	return token;
}

/** Adds the session to the renderer's API requests here rather than in the page: a
 *  header the page sets makes Chromium preflight every new URL, one more round trip
 *  far from the API. Covers the API and its edges: the session cookie's domain. */
export function authorizeApiRequests(): void {
	const { origin, hostname } = new URL(API_BASE);
	const parent = hostname.split('.').slice(1).join('.');
	const urls = [`${origin}/*`, ...(parent.includes('.') ? [`https://*.${parent}/*`] : [])];
	session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
		const headers = details.requestHeaders;
		const set = Object.keys(headers).some(name => name.toLowerCase() === 'authorization');
		if (token && !set) headers.Authorization = `Bearer ${token}`;
		callback({ requestHeaders: headers });
	});
}

function setToken(next: string | null): void {
	token = next;
	persist();
	// push to every frame (top + the /web iframe) so each bridge - and its API
	// client - switches identity.
	broadcast('oss-idle:auth-token', token);
}

/** Swap the one-time code for the session token. */
async function redeem(code: string): Promise<string> {
	const res = await fetch(`${API_BASE}/v1/auth/osu/desktop/exchange`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code }),
	});
	if (!res.ok) throw new Error(`sign-in failed (${res.status})`);
	return (await res.json() as { token: string }).token;
}

/** The code the browser brings back to the loopback, once it carries this login's key. */
const awaitCode = (server: http.Server, key: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('login timed out')), LOGIN_TIMEOUT_MS);
		server.on('close', () => {
			clearTimeout(timer);
			reject(new Error('login superseded'));
		});
		server.on('request', (req, res) => {
			const url = new URL(req.url ?? '/', 'http://127.0.0.1');
			const code = url.searchParams.get('code');
			if (url.pathname !== '/callback' || !code || url.searchParams.get('key') !== key) {
				res.writeHead(404).end();
				return;
			}
			res.writeHead(302, {
				Location: SIGNED_IN_PAGE, Connection: 'close',
			}).end();
			clearTimeout(timer);
			resolve(code);
		});
	});

/** Begin sign-in: listen on a loopback port, open the system browser to the OAuth
 *  flow with it, and redeem the code the browser brings back. */
export async function startLogin(): Promise<void> {
	activeLogin?.close();
	const server = http.createServer();
	activeLogin = server;
	try {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		const key = randomUUID();
		void shell.openExternal(`${API_BASE}/v1/auth/osu/login?client=desktop&port=${port}&key=${key}`);
		const code = await awaitCode(server, key);
		setToken(await redeem(code));
	} finally {
		server.close();
		if (activeLogin === server) activeLogin = null;
	}
}

/** Sign in with a one-time code given at launch (`--sign-in-code=`), for an account whose
 *  code does not come from the browser. A refused code leaves the saved session as it was. */
export async function signInWithCode(code: string): Promise<void> {
	try {
		setToken(await redeem(code));
	} catch (e) {
		console.error('[auth] launch sign-in failed', e);
	}
}

export function logout(): void {
	activeLogin?.close();
	activeLogin = null;
	setToken(null);
}
