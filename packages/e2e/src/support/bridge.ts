/**
 * The shape of `window.__idle`, the dev-only handle the client exposes
 * (packages/client/src/dev/testBridge.ts). Declared here rather than imported:
 * the client is a Vite app and its modules do not load in the runner's Node
 * context. Keep the two in step.
 */

export type Scene =
	'INTRO' | 'MENU' | 'SELECT' | 'GAME' | 'RESULT' | 'SAVER' | 'LOBBY' | 'MATCH' | 'EDITOR';

export type SkillView = {
	name: string;
	level: number;
	xp: number;
	upgrades: number;
	overdrive: number;
	prestige: number;
};

export type CharacterView = {
	id: number;
	name: string;
	guest: boolean;
	generation: number;
	overallLevel: number;
	overallTotalXp: number;
	skills: SkillView[];
};

export type PlayView = {
	token: string;
	beatmapId: number;
	mode?: string;
	rate: number;
	startedAt: number;
	endsAt: number;
	remainingMs: number;
	accuracy?: number;
	grade?: string;
};

export type QueueView = {
	label: string;
	mode?: string;
	entries: { id: number, version: string, title: string }[];
};

export type ScoreView = {
	beatmapId: number;
	score: number;
	accuracy: number;
	maxCombo: number;
	grade: string;
	pp: number;
	pfc: boolean;
	playedAt: number;
};

export type CatalogVersion = {
	id: number;
	version: string;
	/** song length, ms */
	length: number;
	objects: number;
	keys: number;
	mode: number;
	difficulty: number;
};

export type CatalogEntry = {
	id: number;
	title: string;
	artist: string;
	/** song select lists it before it is downloaded */
	bundled: boolean;
	versions: CatalogVersion[];
	/** the shortest difficulty in the set, ms */
	length: number;
};

export type XPGainView = {
	scoreId: number;
	beatmapId: number;
	gains: Record<string, number>;
};

export type TestBridge = {
	finishPlay: () => boolean;
	scene: () => Scene;
	enter: (scene: 'MENU' | 'SELECT') => Promise<void>;
	nowPlaying: () => number | undefined;
	sessionReady: () => boolean;
	noCharacter: () => boolean;
	playLocally: () => Promise<void>;
	character: () => CharacterView;
	saved: () => Promise<void>;
	play: () => PlayView | undefined;
	queue: () => QueueView | undefined;
	countdown: () => number | undefined;
	scores: () => Promise<ScoreView[]>;
	xpGains: () => Promise<XPGainView[]>;
	catalog: () => Promise<CatalogEntry[]>;
	download: (setId: number) => Promise<number[]>;
	sets: () => Promise<number[]>;
	setting: (key: string) => unknown;
	setSetting: (key: string, value: unknown) => Promise<void>;
};

declare global {
	interface Window { __idle?: TestBridge }
}
