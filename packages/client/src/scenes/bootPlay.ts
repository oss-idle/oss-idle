import { t } from '@lingui/core/macro';
import { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import { askConfirm } from '../components/ConfirmPrompt';
import type Character from '../db/schema/character';
import { Score } from '../db/schema/score';
import Entities from '../entity/entities';
import { selectedMods } from '../gameplay/playMods';
import { selectedRate } from '../gameplay/playRate';
import {
	isPlayChoiceOpen,
	message,
} from '../globals';
import Account from '../online/account';
import {
	type LocalStart,
	startLocalPlay,
} from '../online/localPlay';
import {
	abortPlaySession,
	inMatchMessage,
	type PlayContext,
	type PlaySession,
	type RankedPlayContext,
	restrictedMessage,
	startPlaySession,
} from '../online/play';
import { debugReplay } from '../online/services/debugCharacter';
import type LightBeatmap from '../osu/beatmap/LightBeatmap';
import { debugBotOf } from '../rulesets/mania/4k/debugBot';
import { loadPlayer } from '../rulesets/registry';
import type { ManiaPlayer } from '../rulesets/ruleset';
import type { TestPlay } from './Gameplay';

/** A play resolved and ready for the gameplay scene. */
export type Boot = {
	beatmap: Beatmap,
	play: PlayContext,
	/** prior plays of this map by the live character - seeds the memory skill */
	timesPlayed: number,
	/** how the map's ruleset plays here */
	player: ManiaPlayer,
};

type Refusal = 'load' | 'empty' | 'ruleset';

/** The chart a play runs: the stored one, or for a test play the editor's, decoded
 *  under the ids of the difficulty it edits. */
const playChart = async (beatmapInfo: LightBeatmap, test?: TestPlay): Promise<Beatmap> => {
	if (!test) return beatmapInfo.load();
	const beatmap = new BeatmapDecoder().decodeFromString(test.chart);
	beatmap.metadata.beatmapId = beatmapInfo.metadata.id;
	beatmap.metadata.beatmapSetId = beatmapInfo.set.metadata.id;
	return beatmap;
};

/** What a play needs before it starts - its chart, and the player of its ruleset (its
 *  skills and their strain load with it) - or why it can't. */
const loadPlayable = async (
	beatmapInfo: LightBeatmap,
	test?: TestPlay,
): Promise<{ chart: Beatmap, player: ManiaPlayer } | { refused: Refusal }> => {
	let chart: Beatmap;
	try {
		chart = await playChart(beatmapInfo, test);
	} catch (e) {
		console.error('[gameplay] beatmap load failed', e);
		return { refused: 'load' };
	}
	if (chart.hitObjects.length === 0) return { refused: 'empty' };
	const player = await loadPlayer(beatmapInfo.metadata.mode, beatmapInfo.metadata.keys);
	return player ? {
		chart, player,
	} : { refused: 'ruleset' };
};

/** A debug play: the server's no-fail replay of the strain view's knobs. A test play:
 *  a local bot. Neither has a session. */
const debugBoot = async (
	chart: Beatmap,
	player: ManiaPlayer,
	test?: TestPlay,
): Promise<Boot | undefined> => {
	const replay = test ? {} : await debugReplay({
		beatmapId: chart.metadata.beatmapId,
		rate: selectedRate.get(),
		mods: selectedMods.get(),
		...debugBotOf(Entities.character.get()),
	});
	if (!replay) {
		void message.set('The server can\'t play this map with the debug bot.');
		return undefined;
	}
	return {
		beatmap: chart, play: {
			mode: 'debug', ...replay,
		}, timesPlayed: 0, player,
	};
};

/** Start or join the client-owned play for this map and describe it the way a
 *  ranked play is described: a replay with a live timeline. */
const localContext = async (
	character: Character,
	beatmapInfo: LightBeatmap,
	chart: Beatmap,
	start: LocalStart,
): Promise<PlayContext> => {
	const run = await startLocalPlay(character, beatmapInfo, chart, start);
	return {
		...run.tired,
		mode: run.mode,
		token: run.token,
		beatmapId: run.beatmapId,
		rate: run.rate,
		mods: run.mods,
		offsets: run.offsets,
		startedAt: run.startedAt,
		endsAt: run.endsAt,
	};
};

/** Start (or join) the play session. Start-or-join can hand back a play on a
 *  *different* map (quit without abort, then launched another) - its replay
 *  wouldn't match this chart, so the player may abort it for this one. A string
 *  is why the play can't start; undefined, that the player kept the other one. */
const startSession = async (
	start: () => Promise<PlaySession>,
	beatmapId: number,
	title: string,
): Promise<PlaySession | string | undefined> => {
	const elsewhere = (s: PlaySession): s is RankedPlayContext =>
		s.mode === 'ranked' && s.beatmapId !== beatmapId;
	const session = await start();
	if (!elsewhere(session)) return session;
	const abort = await askConfirm({
		title,
		sub: t`Your character is still playing another map. Abort that play to start this one?`,
		confirmLabel: t`Abort it`,
	});
	if (!abort) return undefined;
	await abortPlaySession(session.token);
	const retried = await start();
	return elsewhere(retried) ? t`Couldn't take over the running play.` : retried;
};

/**
 * Resolve a play over the scene that launched it: parse the beatmap, resolve
 * the play session, and ask there when the player has a choice to make.
 * Undefined when the play doesn't start (refused, or cancelled).
 */
export async function bootPlay(
	beatmapInfo: LightBeatmap,
	debugPlay: boolean,
	test?: TestPlay,
): Promise<Boot | undefined> {
	const fail = (reason: string) => {
		void message.set(reason);
		return undefined;
	};
	const title = `${beatmapInfo.set.metadata.artist} - ${beatmapInfo.set.metadata.title}`;

	const refusals: Record<Refusal, string> = {
		load: t`This difficulty failed to load.`,
		empty: t`This difficulty has no notes to play.`,
		ruleset: t`This difficulty can't be played here.`,
	};
	const playable = await loadPlayable(beatmapInfo, test);
	if ('refused' in playable) return fail(refusals[playable.refused]);
	const { chart, player } = playable;

	if (debugPlay || test) return debugBoot(chart, player, test);

	// commit to a character before scoring - a play resolved mid-validation must
	// not be mis-scored. During server downtime this waits rather than guessing.
	await Account.ready();
	const character = Entities.character.get();
	// still the placeholder: no character yet, local or online play comes first
	if (character.id === 0) {
		void isPlayChoiceOpen.set(true);
		return undefined;
	}
	const start = () => startPlaySession(
		character, chart.metadata.beatmapId, beatmapInfo.lockedRate, beatmapInfo.lockedMods,
	);
	const session = await startSession(start, chart.metadata.beatmapId, title);
	if (session === undefined) return undefined;
	if (typeof session === 'string') return fail(session);

	if (session.mode === 'restricted') return fail(restrictedMessage());
	if (session.mode === 'inMatch') return fail(inMatchMessage());

	let play: PlayContext;
	if (session.mode === 'refused') {
		const local = await askConfirm({
			title,
			sub: t`A game is already in progress. Play locally instead? It won't be submitted.`,
			confirmLabel: t`Play unranked`,
			color: '#85b81e',
		});
		if (!local) return undefined;
		play = await localContext(character, beatmapInfo, chart, { mode: 'unranked' });
	} else if (session.mode === 'ranked') {
		play = session;
	} else {
		// start (or join) the local play, then watch it - the same shape the
		// server hands back for a ranked one
		play = await localContext(character, beatmapInfo, chart, session);
	}

	const timesPlayed = await Score.countPlays(
		character.id,
		chart.metadata.beatmapId,
		character.progress.memoryResetAt,
		character.memoryForgets(),
	);
	return {
		beatmap: chart, play, timesPlayed, player,
	};
}
