/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Base URL of the oss!idle backend (used for the OAuth entry point). */
	readonly VITE_API_URL?: string
	/** Edges nearer some players, comma-separated: the game measures and picks. */
	readonly VITE_API_EDGES?: string;
	/** '1' in a build for the PBE. */
	readonly VITE_PBE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// `.po` catalogs are compiled to a `messages` export by @lingui/vite-plugin.
declare module '*.po' {
	import type { Messages } from '@lingui/core';
	export const messages: Messages;
}
