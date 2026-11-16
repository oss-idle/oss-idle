/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	detectBrowserLocale,
	type Locale,
} from '@oss-idle/shared/i18n/locales';
import type { Mod } from '@oss-idle/shared/mods';
import {
	AUTOPILOT_MODE,
	AutopilotMode,
} from '@oss-idle/shared/queue';
import type { BoardSort } from '@oss-idle/shared/rankings';
import {
	RULESET_IDS,
	type RulesetId,
} from '@oss-idle/shared/rulesets/ids';

import { selectedRuleset } from '../rulesets/registry';

export const SCORE_TAB = mapped(['LOCAL', 'GLOBAL', 'COUNTRY', 'FRIENDS', 'MINE', 'RATE']);
export type ScoreTab = ValueIn<typeof SCORE_TAB>;

export const GroupOptions = [
	'No Grouping', 'By Artist', 'By BPM', 'By Creator', 'By Difficulty',
	'By Best Score', 'By Download Status', 'By Length', 'By Playlist', 'By Rank Achieved', 'By Status', 'By Tag',
	'By Title', 'Recently Played',
] as const;
export const GROUP_OPTION = mapped(GroupOptions);
export type GroupOption = ValueIn<typeof GROUP_OPTION>;

export const SortOptions = [
	'By Artist', 'By BPM', 'By Best Score', 'By Creator', 'By Difficulty',
	'By Length', 'By Rank Achieved', 'By Title', 'Recently Played',
] as const;
export const SORT_OPTION = mapped(SortOptions);
export type SortOption = ValueIn<typeof SORT_OPTION>;

/** Frames per second cap, or the display's refresh rate / no cap at all. */
export type FrameLimit = 'vsync' | number;

export class Setting<T, K extends string = string> extends Synced<T> {


	constructor(
		public readonly key: K,
		public readonly defaultValue: T,
	) {
		super(defaultValue);
		this.load();
		this.forceSync(value => this.save(value));
	}

	private load() {
		this.set(JSON.parse(
			localStorage.getItem(this.key)?? JSON.stringify(this.defaultValue),
		));
	}

	private save(value: T) {
		localStorage.setItem(this.key, JSON.stringify(value));
	}

}

/**
 * A setting each ruleset keeps its own of: it reads and sets the selected
 * ruleset's, and follows the pick. 4K keeps the bare key, the one saved before
 * the setting was per ruleset; another ruleset starts from 4K's.
 */
export class RulesetSetting<T, K extends string = string> extends Synced<T> {

	private readonly each: Record<RulesetId, Setting<T>>;

	constructor(
		public readonly key: K,
		public readonly defaultValue: T,
	) {
		const first = new Setting<T>(key, defaultValue);
		super(first.get());
		this.each = Object.fromEntries(RULESET_IDS.map(id => [
			id, id === 'mania4k' ? first : new Setting<T>(`${key}:${id}`, first.get()),
		])) as Record<RulesetId, Setting<T>>;
		for (const id of RULESET_IDS) {
			this.each[id].forceSync(value => {
				if (id === selectedRuleset.get()) void super.set(value);
			});
		}
		selectedRuleset.forceSync(id => void super.set(this.each[id].get()));
	}

	override set(value: T): Promise<void> {
		return this.each[selectedRuleset.get()].set(value);
	}

	/** The setting in `ruleset`, picked or not. */
	of(ruleset: RulesetId): Setting<T> {
		return this.each[ruleset];
	}

}

/** Moved off its default; a plain `Synced` has none, so never counts. */
export const isChanged = <T>(value: Synced<T>, current: T): boolean =>
	(value instanceof Setting || value instanceof RulesetSetting)
	&& JSON.stringify(current) !== JSON.stringify(value.defaultValue);

export type DefaultSettings = readonly (Setting<any, string> | RulesetSetting<any, string>)[];

const option = <T>() =>
	<K extends string>(key: K, defaultValue: T) =>
		new Setting<T, K>(key, defaultValue);

/** An option each ruleset keeps its own of. */
const rulesetOption = <T>() =>
	<K extends string>(key: K, defaultValue: T) =>
		new RulesetSetting<T, K>(key, defaultValue);

/** Keys this device had saved before this load wrote the defaults. */
const stored = new Set(Object.keys(localStorage));
export const wasStored = (key: string): boolean => stored.has(key);

/** A number this device saved under `key`, else `fallback`. */
const storedNumber = (key: string, fallback: number): number => {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '');
		return typeof saved === 'number' ? saved : fallback;
	} catch {
		return fallback;
	}
};

const defaults = [
	/**
	 * Volume controls
	 */
	option<number>()('mainVolume', 1),
	option<number>()('musicVolume', 0.15),
	option<number>()('effectVolume', 0.15),
	/**
	 * Currently selected song select leaderboard tab
	 */
	option<ScoreTab>()('leaderboard', SCORE_TAB.GLOBAL),
	/**
	 * What the song select leaderboard is ordered by
	 */
	option<BoardSort>()('leaderboardSort', 'score'),
	/**
	 * Song selection group category
	 */
	option<GroupOption>()('groupby', GROUP_OPTION['No Grouping']),
	/**
	 * Song selection sort filter
	 */
	option<SortOption>()('sortby', SORT_OPTION['By Difficulty']),
	/**
	 * Last tutorial step reached; >= the wizard's step count means completed
	 */
	option<number>()('tutorial', 0),
	/**
	 * Last news seen, used in the main menu
	 */
	option<number>()('news', 0),
	/**
	 * Last client version run, for the "updated" notice in the main menu
	 */
	option<string>()('lastVersion', ''),
	/**
	 * The current song select search
	 */
	option<string>()('search', ''),
	/**
	 * Touch long-press duration (ms) before it counts as a right click
	 */
	option<number>()('longpress', 400),
	/** 4K's scroll speed (the one there was before rulesets had their own) */
	option<number>()('scrollspeed', 16),
	/** 7K's, starting where the shared one was */
	option<number>()('scrollspeed7k', storedNumber('scrollspeed', 16)),
	/**
	 * The installed skin the editor draws its notes with (0: the default skin); the
	 * gameplay skin is the enabled one.
	 */
	option<number>()('editorSkin', 0),
	/**
	 * Playback rate picked in song select (held to what Speed upgrades unlock), and
	 * whether the music's pitch follows it.
	 */
	rulesetOption<number>()('rate', 1),
	option<boolean>()('pitchFollowsRate', true),
	/** every sound fades out while the game's window or tab is in the background */
	option<boolean>()('muteInBackground', false),
	/** the last rate picked on each side, which turning that mod back on brings back */
	option<number>()('fasterRate', 1.05),
	option<number>()('slowerRate', 0.95),
	/** the other mods picked in song select (EZ, NF, HR, SD, PF, JT) */
	rulesetOption<Mod[]>()('mods', []),
	/** the ruleset a guest plays: a signed-in character's is the server's */
	option<RulesetId>()('guestRuleset', 'mania4k'),
	/**
	 * Active UI language. Defaults to the browser's preferred locale on first
	 * run, then sticks to the player's explicit choice. Read at boot (main.tsx)
	 * and re-activated whenever the picker changes it.
	 */
	option<Locale>()('language', detectBrowserLocale()),
	/**
	 * Graphics toggles. `backgroundDim` is the gameplay background darkening
	 * amount (0 = fully visible, 1 = black).
	 */
	option<boolean>()('showFps', false),
	option<FrameLimit>()('frameLimiter', 'vsync'),
	/** cap the frame rate (UNFOCUSED_FPS) while the game window isn't focused */
	option<boolean>()('capUnfocused', true),
	option<boolean>()('fullscreen', false),
	option<number>()('uiScale', 1),
	option<boolean>()('parallax', true),
	option<boolean>()('osuMusicTheme', true),
	option<boolean>()('showThumbnails', true),
	// song select grades: the best at any rate, as the profile counts them, not the picked rate's
	option<boolean>()('bestGradeAnyRate', false),
	// bundled maps not downloaded yet, listed in song select
	option<boolean>()('showUndownloaded', true),
	// with showUndownloaded, the approved maps that aren't bundled too
	option<boolean>()('showUnbundled', false),
	option<number>()('backgroundDim', 0.8),
	option<number>()('cursorSize', 1),
	/** the editor's live gameplay preview beside its playfield */
	option<boolean>()('editorPreview', true),
	/** BPMs over the editor's cap go in without asking: said yes to it once */
	option<boolean>()('editorHighBpm', false),
	rulesetOption<number>()('autopilotDelay', 30),
	// every setting is written on first load, so an existing player keeps Playlist
	rulesetOption<AutopilotMode>()('autopilotMode', AUTOPILOT_MODE.NEXT),
	rulesetOption<boolean>()('queuePlayOnce', false),
] as const satisfies DefaultSettings;

type SettingsByKey<T extends DefaultSettings> = {
	[O in T[number] as O['key']]: O;
};

export const SETTINGS = defaults.reduce((acc, option) => {
	acc[option.key as keyof typeof acc] = option as any;
	return acc;
}, {} as SettingsByKey<typeof defaults>);

/** A ruleset's scroll speed: each mania ruleset keeps its own. */
export const scrollSpeedOf = (ruleset?: RulesetId) =>
	(ruleset === 'mania7k' ? SETTINGS.scrollspeed7k : SETTINGS.scrollspeed);
