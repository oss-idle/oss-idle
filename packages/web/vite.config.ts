import { lingui } from '@lingui/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import {
	defineConfig,
	type Plugin,
} from 'vite';

// changelog/ sits outside this package, so the dev server doesn't watch it and
// pages/changelog/builds.ts's glob would miss builds added after it started.
function watchChangelog(): Plugin {
	return {
		name: 'watch-changelog',
		configureServer(server) {
			server.watcher.add(new URL('../../changelog', import.meta.url).pathname);
		},
	};
}

// Served at /web on the same origin as the game. In dev the game's Vite server
// proxies /web here (see packages/client/vite.config.ts); in prod this builds
// into the game's dist so one static directory serves both at one origin.
export default defineConfig({
	base: '/web/',
	// `@vitejs/plugin-react` already runs Babel, so Lingui's macros transform
	// through its babel plugin here - no separate SWC/Babel toolchain. The lingui
	// plugin compiles the `.po` catalogs imported in src/i18n.ts.
	plugins: [
		// Must run before the React plugin so the generated route tree is in place.
		tanstackRouter({
			target: 'react', autoCodeSplitting: true, 
		}),
		react({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro'] } }),
		lingui(),
		watchChangelog(),
	],
	server: {
		port: Number(process.env.DEV_WEB_PORT ?? 5174),
		strictPort: true,
		host: true,
		allowedHosts: ['.lan'],
		// The page is loaded via the game's origin (proxied), so point the HMR
		// socket straight at this dev server (on the page's host) to survive the
		// proxy hop.
		hmr: {
			protocol: 'ws',
			port: Number(process.env.DEV_WEB_PORT ?? 5174),
		},
	},
	build: {
		target: 'esnext',
		outDir: 'dist',
		emptyOutDir: true,
	},
});
