import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lingui } from '@lingui/vite-plugin';
import react from '@vitejs/plugin-react';
import {
	defineConfig,
	type Plugin,
} from 'vite';

import catalogCompletion from './catalogCompletion';

const MIME: Record<string, string> = {
	'.osz': 'application/octet-stream',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.mp3': 'audio/mpeg',
	'.ogg': 'audio/ogg',
};

/**
 * Dev-server fallback for static asset filenames containing reserved chars that
 * can only travel percent-encoded - notably '#' (osu! set/preview folders carry
 * it). Vite's static middleware decodes request paths with `decodeURI`, which
 * leaves '#'/'?' encoded, so it never matches such files on disk and falls
 * through to the SPA index.html (which then fails to parse/unzip). Resolve those
 * requests against publicDir ourselves with full percent-decoding. Prod is
 * unaffected - the static host (nginx) decodes '%23' to '#' natively.
 */
function serveEncodedAssets(): Plugin {
	return {
		name: 'serve-encoded-assets',
		configureServer(server) {
			const root = path.resolve(server.config.publicDir);
			// registered inside configureServer (not the returned post hook) so it
			// runs before Vite's own static/SPA-fallback middlewares.
			server.middlewares.use((req, res, next) => {
				if (req.method !== 'GET' && req.method !== 'HEAD') return next();
				const reqPath = (req.url ?? '').split('?')[0];
				if (!/%(23|3F)/i.test(reqPath)) return next();
				let file: string;
				try { file = path.join(root, decodeURIComponent(reqPath)); }
				catch { return next(); }
				if (!file.startsWith(root + path.sep)) return next();
				fs.stat(file, (err, stat) => {
					if (err || !stat.isFile()) return next();
					res.setHeader('Content-Length', stat.size);
					res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
					if (req.method === 'HEAD') return void res.end();
					fs.createReadStream(file).pipe(res);
				});
			});
		},
	};
}

/** How much of each language's game catalog is translated, for the language picker: the
 *  catalogs themselves only load for the language in use. */
const catalogCompletions = () => {
	const dir = new URL('./src/locales/', import.meta.url);
	return Object.fromEntries(fs.readdirSync(dir)
		.filter(file => file.endsWith('.po'))
		.map(file => [
			file.slice(0, -'.po'.length),
			catalogCompletion(fs.readFileSync(new URL(file, dir), 'utf8')),
		]));
};

// https://vite.dev/config/
/** The dev server follows public/.htaccess's /discord redirect too (prod is Apache). */
const discordRedirect = (): Plugin => ({
	name: 'discord-redirect',
	configureServer(server) {
		const htaccess = fs.readFileSync(new URL('./public/.htaccess', import.meta.url), 'utf8');
		const target = htaccess.match(/Redirect \d+ \/discord (\S+)/)?.[1];
		server.middlewares.use('/discord', (_req, res) => {
			res.statusCode = 302;
			res.setHeader('Location', target ?? '/');
			res.end();
		});
	},
});

const MAX_PROFILE_BYTES = 5 << 20;

/** The frame profiler's reports (src/dev/profiler.ts), kept in profiles/ at the repo root. */
const MAX_TRACE_BYTES = 300 << 20;

const profileReports = (): Plugin => ({
	name: 'profile-reports',
	configureServer(server) {
		const dir = fileURLToPath(new URL('../../profiles/', import.meta.url));
		// the staging app's Chromium traces (packages/desktop/src/trace.ts), gzipped
		server.middlewares.use('/__trace', (req, res) => {
			const chunks: Buffer[] = [];
			let size = 0;
			req.on('data', (chunk: Buffer) => {
				size += chunk.length;
				if (size <= MAX_TRACE_BYTES) chunks.push(chunk);
			});
			req.on('end', () => {
				if (req.method !== 'POST' || size > MAX_TRACE_BYTES) {
					res.statusCode = 400;
					return void res.end();
				}
				fs.mkdirSync(dir, { recursive: true });
				const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.trace.json.gz`;
				fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
				res.end();
			});
		});
		server.middlewares.use('/__profile', (req, res) => {
			const chunks: Buffer[] = [];
			let size = 0;
			req.on('data', (chunk: Buffer) => {
				size += chunk.length;
				if (size <= MAX_PROFILE_BYTES) chunks.push(chunk);
			});
			req.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8');
				try {
					if (req.method !== 'POST' || size > MAX_PROFILE_BYTES) throw new Error();
					JSON.parse(body);
				} catch {
					res.statusCode = 400;
					return void res.end();
				}
				fs.mkdirSync(dir, { recursive: true });
				const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
				fs.writeFileSync(path.join(dir, name), body);
				res.end();
			});
		});
	},
});

export default defineConfig({
	define: { __CATALOG_COMPLETION__: JSON.stringify(catalogCompletions()) },
	// `@vitejs/plugin-react` already runs Babel, so Lingui's macros transform
	// through its babel plugin here - no separate SWC/Babel toolchain. The lingui
	// plugin compiles the `.po` catalogs imported in src/i18n.ts.
	plugins: [
		react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } }),
		lingui(),
		serveEncodedAssets(),
		discordRedirect(),
		profileReports(),
	],
	// `@oss-idle/shared` is a linked workspace package, so Vite doesn't pre-bundle
	// it and won't see the deps its sim pulls (osu-classes, osu-mania-stable) until
	// the gameplay/strain path first loads them. That late discovery triggers a dep
	// re-optimization mid-session; if it lands on an HMR update instead of a full
	// reload, react-dom stays on the old optimize hash while React core jumps to the
	// new one - two copies of React, and hooks crash with a null dispatcher. Listing
	// them here makes the first optimize pass complete so the hash never shifts.
	optimizeDeps: {
		include: [
			'osu-classes',
			'osu-mania-stable',
		],
	},
	server: {
		// DEV_*_PORT: a second stack (a worktree) runs beside this one on other ports
		port: Number(process.env.DEV_CLIENT_PORT ?? 5173),
		strictPort: true,
		host: true,
		// the LAN staging is reached by name (a hosts entry for e.g. oss.idle.lan)
		allowedHosts: ['.lan'],
		// lets the frame profiler run Chromium's JS sampler (src/dev/sampler.ts)
		headers: { 'Document-Policy': 'js-profiling' },
		// the API answers CORS for what is proxied to it: Vite's own would refuse the staging
		// app's app:// origin a preflight, and so every write the app sends
		cors: false,
		// Serve the osu! web platform at /web on the game's own origin so the
		// in-game browser iframe is same-origin. The web app runs its own dev
		// server (packages/web, :5174) with base '/web/'; we proxy to it.
		// The API is proxied too, for a dev setup that leaves VITE_API_URL empty
		// and talks to it on the game's origin (no CORS, one cookie host).
		proxy: {
			'/web': {
				target: `http://localhost:${process.env.DEV_WEB_PORT ?? 5174}`,
				changeOrigin: false,
				ws: true,
			},
			'/v1': {
				target: `http://localhost:${process.env.DEV_API_PORT ?? 3873}`,
				changeOrigin: false,
				ws: true,
			},
			'/uploads': `http://localhost:${process.env.DEV_API_PORT ?? 3873}`,
			'/skin-files': `http://localhost:${process.env.DEV_API_PORT ?? 3873}`,
			// the public API
			'/api': `http://localhost:${process.env.DEV_API_PORT ?? 3873}`,
			'/oauth': `http://localhost:${process.env.DEV_API_PORT ?? 3873}`,
		},
	},
	build: { target: 'esnext' },
});
