import type Synced from '@oss-idle/shared/helpers/synced';
import {
	type SkillName,
	Skills,
} from '@oss-idle/shared/rulesets/mania/4k/skills';

import { music } from '../audio/MusicPlayer';
import { DB } from '../db/dao';
import { Score } from '../db/schema/score';
import { ScoreXP } from '../db/schema/score_xp';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import PlayQueue from '../gameplay/playQueue';
import Account from '../online/account';
import {
	currentLocalPlay,
	finishLocalPlay,
} from '../online/localPlay';
import PlayManager from '../online/playManager';
import BeatmapAPI from '../osu/beatmap/beatmap_api';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import SceneManager, {
	SCENE,
	type Scene,
} from '../scenes/SceneManager';
import { menuWarmed } from '../warmup/menuWarmed';

/**
 * Dev-only window handle the end-to-end suite (`packages/e2e`) drives the app
 * through. It reads the same state the UI reads, and writes only to skip what a
 * test is not about: end a local play now instead of waiting the song out, or
 * answer the first-Play choice with local play without its menu clicks.
 * Everything else a test does, it does by clicking.
 *
 * Loaded from main.tsx behind `DEV_TOOLS` (dev, or a staging build's menu), so a
 * release build never contains it.
 */

type SkillView = {
	name: string;
	level: number;
	xp: number;
	upgrades: number;
	overdrive: number;
	prestige: number;
};

type CharacterView = {
	id: number;
	name: string;
	guest: boolean;
	generation: number;
	overallLevel: number;
	overallTotalXp: number;
	skills: SkillView[];
};

type PlayView = {
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

type ScoreView = {
	beatmapId: number;
	score: number;
	accuracy: number;
	maxCombo: number;
	grade: string;
	pp: number;
	pfc: boolean;
	playedAt: number;
};

const character = (): CharacterView => {
	const c = Entities.character.get();
	return {
		id: c.id,
		name: c.name,
		guest: c.isGuest(),
		generation: c.generation,
		overallLevel: c.progress.overallLevel,
		overallTotalXp: c.progress.overallTotalXp,
		skills: c.skills.map(s => ({
			name: s.name,
			level: s.level.get(),
			xp: s.xp.get(),
			upgrades: s.upgrades.get(),
			overdrive: s.overdrive.get(),
			prestige: s.prestige.get(),
		})),
	};
};

const play = (): PlayView | undefined => {
	const live = PlayManager.live.get();
	if (!live) return undefined;
	return {
		token: live.token,
		beatmapId: live.beatmap.metadata.id,
		mode: currentLocalPlay()?.mode,
		rate: live.rate,
		startedAt: live.startedAt,
		endsAt: live.endsAt,
		remainingMs: live.endsAt - Date.now(),
		accuracy: live.accuracy,
		grade: live.grade,
	};
};

const queue = () => {
	const state = PlayQueue.state.get();
	if (!state) return undefined;
	return {
		label: state.label,
		mode: state.mode,
		entries: state.entries.map(({ beatmap: e, repeat }) => ({
			id: e.metadata.id,
			version: e.metadata.version,
			title: e.set.metadata.title,
			repeat,
		})),
	};
};

const scores = async (): Promise<ScoreView[]> => {
	const rows = await Score.query(
		'SELECT * FROM score WHERE characterId = ? ORDER BY playedAt DESC',
		[Entities.character.get().id],
	);
	return rows.map(s => ({
		beatmapId: s.beatmapId,
		score: s.score,
		accuracy: s.accuracy,
		maxCombo: s.maxCombo,
		grade: s.grade,
		pp: s.pp,
		pfc: s.pfc,
		playedAt: s.playedAt,
	}));
};

/** Every set the catalog offers, shortest first - a test picks a short map so
 *  the download and the play it runs stay cheap. */
const catalog = async () => {
	const manifest = await BeatmapAPI.getManifest();
	return manifest.beatmaps
		.map(m => ({
			id: m.id,
			title: m.title,
			artist: m.artist,
			bundled: m.bundled,
			versions: m.versions.map(v => ({
				id: v.id,
				version: v.version,
				length: v.total_length,
				objects: v.objects,
				keys: v.keys,
				mode: v.mode,
				difficulty: v.difficulty,
			})),
			length: Math.min(...m.versions.map(v => v.total_length)),
		}))
		.sort((a, b) => a.length - b.length);
};

/** Put a set in the local store without going through song select, for tests
 *  whose subject is not the download. */
const download = async (setId: number): Promise<number[]> => {
	const manifest = await BeatmapAPI.getManifest();
	const meta = manifest.beatmaps.find(m => m.id === setId);
	if (!meta) throw new Error(`no such set in the catalog: ${setId}`);
	await BeatmapAPI.downloadOsz(meta);
	const set = (await BeatmapStore.getAllSets()).find(s => s.metadata.id === setId);
	return set?.getPlayableBeatmaps().map(b => b.metadata.id) ?? [];
};

const bridge = {
	/** the running play ends now, with the outcome it was born with */
	finishPlay: (): boolean => {
		const run = currentLocalPlay();
		if (!run) return false;
		finishLocalPlay(run.token);
		return true;
	},
	scene: (): Scene => SceneManager.current.get(),
	/** skip the intro and the menu clicks, for tests whose subject is not them.
	 *  Like the intro, it waits for the hidden boot copy of the menu to go. */
	enter: async (scene: typeof SCENE.MENU | typeof SCENE.SELECT): Promise<void> => {
		await menuWarmed;
		SceneManager.set(scene);
	},
	/** the difficulty the music player has, playing or not */
	nowPlaying: (): number | undefined => music.beatmap.get()?.metadata.id,
	/** The session has answered *and* the live character it decided on is in
	 *  place (or it decided there is none yet) - the placeholder is still there
	 *  for a moment after it resolves. */
	sessionReady: (): boolean =>
		Account.resolved.get() && (Entities.character.get().id !== 0 || Account.noCharacter.get()),
	/** no character yet: the first Play asks for local or online play */
	noCharacter: (): boolean => Account.noCharacter.get(),
	/** the first-Play choice, answered with local play (boot.spec clicks it) */
	playLocally: (): Promise<void> => Account.playLocally(),
	character,
	/** every local database write so far has reached IndexedDB */
	saved: (): Promise<void> => DB.saved(),
	play,
	queue,
	countdown: (): number | undefined => PlayManager.countdown.get(),
	scores,
	/** Per-skill xp booked for each saved play, newest first. */
	xpGains: async () => {
		const rows = await ScoreXP.query(
			'SELECT * FROM score_xp WHERE characterId = ? ORDER BY playedAt DESC',
			[Entities.character.get().id],
		);
		return rows.map(row => ({
			scoreId: row.scoreId,
			beatmapId: row.beatmapId,
			gains: Object.fromEntries(
				Skills.map(s => [s, row.gainOf(s)]).filter(([, gained]) => (gained as number) > 0),
			) as Partial<Record<SkillName, number>>,
		}));
	},
	catalog,
	download,
	sets: async (): Promise<number[]> =>
		(await BeatmapStore.getAllSets()).map(s => s.metadata.id),
	setting: (key: keyof typeof SETTINGS) => SETTINGS[key].get(),
	setSetting: async (key: keyof typeof SETTINGS, value: unknown): Promise<void> => {
		await (SETTINGS[key] as Synced<unknown>).set(value);
	},
};

export type TestBridge = typeof bridge;

declare global {
	interface Window { __idle?: TestBridge }
}

window.__idle = bridge;
