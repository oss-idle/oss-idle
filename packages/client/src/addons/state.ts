import { toText } from '@oss-idle/shared/big';
import Synced from '@oss-idle/shared/helpers/synced';
import type { SkillGain } from '@oss-idle/shared/play';

/** What the game is doing, as plain data. Read-only: nothing here acts on the game. */
export type GameState = {
	/** the scene on screen */
	scene: 'intro' | 'menu' | 'select' | 'game' | 'result' | 'lobby' | 'match' | 'saver' | 'editor',
	/** what is open over the scene; the topmost when several are */
	open?: 'genetic-choice' | 'play-choice' | 'web' | 'options' | 'medals' | 'community'
		| 'skins' | 'addons' | 'character' | 'queue' | 'direct' | 'mods',
	/** song select's selected difficulty */
	selected?: { beatmapId: number, setId: number, installed: boolean, downloading: boolean },
	/** the character's running play, wherever the player is; times in ms on this device's clock */
	play?: { beatmapId: number, rate: number, mods: string[], startedAt: number, endsAt: number },
	/** the last play that ended since the game started; a failed one has no grade, accuracy or pp */
	result?: {
		beatmapId: number,
		failed: boolean,
		grade?: string,
		accuracy?: number,
		pp?: number,
		/** XP gained, by skill, as text: it can exceed any number type */
		xp: Record<string, string>,
		endedAt: number,
	},
	/** the genes the character can learn or upgrade now, with the climaxx it has: `tier` is the
	 *  one it would reach, `price` what it costs, `does` what it would do then; none in a
	 *  ruleset without genetics */
	genes?: { id: string, name: string, skill: string, tier: number, price: number, does: string }[],
	/** the character's genetics, whole; none in a ruleset without genetics */
	genetics?: {
		/** the skills it was born good at, one per generation */
		picks: string[],
		/** every skill, in ring order (a skill's neighbours are the ones either side), with the
		 *  climaxx it has to spend, as text */
		skills: { skill: string, climaxx: string }[],
		/** every gene of the ruleset: `parent` is the gene learned before it, `tier` the one it
		 *  holds (0: not learned), `max` its last, `does` what it does at the tier held, or would
		 *  at its first */
		genes: {
			id: string, name: string, skill: string, parent?: string, tier: number, max: number, does: string,
		}[],
	},
};

export type StateHost = {
	current: () => GameState,
	/** called now and on every change; returns what stops it */
	watch: (onChange: (state: GameState) => void) => () => void,
};

const frozen = <T>(value: T): T => {
	if (value && typeof value === 'object') Object.values(value).forEach(frozen);
	return Object.freeze(value);
};

const state = new Synced<GameState>(frozen({ scene: 'intro' }));

export const stateHost: StateHost = {
	current: () => state.get(),
	watch: onChange => state.forceSync(now => onChange(now)),
};

/** A new snapshot, when `value` is not what the last one says. */
export const setState = <K extends keyof GameState>(key: K, value: GameState[K]): void => {
	const {
		[key]: old, ...rest
	} = state.get();
	if (JSON.stringify(old) === JSON.stringify(value)) return;
	void state.set(frozen((value === undefined ? rest : {
		...rest, [key]: value,
	}) as GameState));
};

type Selected = { metadata: { id: number, runtime?: boolean }, set: { metadata: { id: number } } };

/** Song select's selection; a difficulty that is only in the catalog is not installed. */
export const showSelected = (beatmap: Selected | undefined, downloading: boolean): void =>
	setState('selected', beatmap && {
		beatmapId: beatmap.metadata.id,
		setId: beatmap.set.metadata.id,
		installed: !!beatmap.metadata.runtime,
		downloading,
	});

/** A play of the character's ended with a result. */
export const recordResult = (
	beatmapId: number,
	failed: boolean,
	score?: { grade: string, accuracy: number, pp: number },
	gains: SkillGain[] = [],
): void => setState('result', {
	beatmapId,
	failed,
	...score && {
		grade: score.grade, accuracy: score.accuracy, pp: score.pp,
	},
	xp: Object.fromEntries(gains.filter(g => g.gained.gt(0)).map(g => [g.skill, toText(g.gained)])),
	endedAt: Date.now(),
});
