import type { ScoreDTO } from '@oss-idle/shared/score';

import { Score } from '../db/schema/score';
import { ScoreCursor } from '../db/schema/score_cursor';
import { ScoreSync } from '../db/schema/score_sync';
import {
	fetchMyScores,
	fetchScoreState,
	type ScoreState,
} from './services/scores';

/** How often a session pulls the account's new scores and checks for a rebuild. */
const CHECK_EVERY_MS = 5 * 60_000;

const KINDS = [false, true];

let running = false;
let checkedAt = 0;
let next: ReturnType<typeof setTimeout> | undefined;

type Ruleset = ScoreState['rulesets'][number];

/** The account's scores in `ruleset` of one kind after the id `after` (or played at or
 *  after `playedAfter`), page by page into `take`. The last id taken, or undefined when a
 *  page failed. */
const download = async (
	ruleset: Ruleset,
	unranked: boolean,
	after: number,
	take: (scores: ScoreDTO[]) => Promise<void>,
	playedAfter?: number,
): Promise<number | undefined> => {
	for (let from = playedAfter; ; from = undefined) {
		const page = await fetchMyScores(ruleset, unranked, after, from);
		if (!page) return undefined;
		await take(page.scores);
		after = page.scores.at(-1)?.id ?? after;
		if (page.next === undefined) return after;
	}
};

/** Every score the account ever stored, swapped in at once for its local copies. */
const rebuild = async (state: ScoreState) => {
	const before = Date.now();
	const fetched: ScoreDTO[] = [];
	const cursors: [Ruleset, boolean, number][] = [];
	for (const ruleset of state.rulesets) {
		for (const unranked of KINDS) {
			const after = await download(ruleset, unranked, 0, async scores => void fetched.push(...scores));
			if (after === undefined) return;
			cursors.push([ruleset, unranked, after]);
		}
	}
	await Score.replaceServerScores(state.characters, fetched, before);
	for (const cursor of cursors) await ScoreCursor.set(state.userId, ...cursor);
	await new ScoreSync({
		userId: state.userId, version: state.version,
	}).add();
	console.log(`[scores] rebuilt ${fetched.length} local scores at version ${state.version}`);
};

/** The scores the account stored since the last pull: plays the server ran while the game
 *  was closed or offline. Without a cursor yet, from the newest copy this device holds. */
const pull = async ({ userId, rulesets, characters }: ScoreState) => {
	let pulled = 0;
	let since: number | undefined;
	for (const ruleset of rulesets) {
		for (const unranked of KINDS) {
			const after = await ScoreCursor.of(userId, ruleset, unranked);
			if (after === undefined) since ??= await Score.lastServerPlay(characters) ?? 0;
			await download(ruleset, unranked, after ?? 0, async scores => {
				const last = scores.at(-1);
				if (!last) return;
				await Score.storeServerScores(scores);
				await ScoreCursor.set(userId, ruleset, unranked, last.id);
				pulled += scores.length;
			}, after === undefined ? since : undefined);
		}
	}
	if (pulled) console.log(`[scores] pulled ${pulled} scores`);
};

/**
 * Keep the signed-in account's local copies of its scores up to date, now and every few
 * minutes while signed in: the scores stored since the last pull come down, and once the
 * server's score version is newer than the one they were rebuilt at, every score is
 * downloaded again and swapped in (after the reprocessor is done with the account). Plays
 * that only exist on this device (guests, local unranked plays) are never touched.
 */
export const syncScores = async (): Promise<void> => {
	if (running || Date.now() - checkedAt < CHECK_EVERY_MS) return;
	running = true;
	clearTimeout(next);
	let signedIn = true;
	try {
		const state = await fetchScoreState();
		if (!state) {
			signedIn = false;
			return;
		}
		checkedAt = Date.now();
		if (await ScoreSync.versionOf(state.userId) < state.version && !state.pending) await rebuild(state);
		else await pull(state);
	} catch (e) {
		console.warn('[scores] local score sync failed', e);
	} finally {
		running = false;
		if (signedIn) next = setTimeout(() => void syncScores(), CHECK_EVERY_MS);
	}
};
