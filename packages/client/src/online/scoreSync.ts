import type { ScoreDTO } from '@oss-idle/shared/score';

import { Score } from '../db/schema/score';
import { ScoreSync } from '../db/schema/score_sync';
import {
	fetchMyScores,
	fetchScoreState,
} from './services/scores';

/** How often a session checks again, and how long it waits while the reprocessor
 *  still works on the account's scores. */
const CHECK_EVERY_MS = 10 * 60_000;

let running = false;
let checkedAt = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

/**
 * Rebuild the signed-in account's local copies of its scores from the server once the
 * server's score version is newer than the one they were rebuilt at: every score the
 * account ever stored is downloaded, then swapped in at once. It waits while the
 * reprocessor still has the account's scores to bring up, and never touches plays
 * that only exist on this device (guests, local unranked plays).
 */
export const syncScores = async (): Promise<void> => {
	if (running || Date.now() - checkedAt < CHECK_EVERY_MS) return;
	running = true;
	clearTimeout(retry);
	try {
		const state = await fetchScoreState();
		if (!state) return;
		checkedAt = Date.now();
		if (await ScoreSync.versionOf(state.userId) >= state.version) return;
		if (state.pending > 0) {
			retry = setTimeout(() => void syncScores(), CHECK_EVERY_MS);
			return;
		}
		const before = Date.now();
		const fetched: ScoreDTO[] = [];
		for (const ruleset of state.rulesets) {
			for (let after: number | undefined = 0; after !== undefined;) {
				const page = await fetchMyScores(ruleset, after);
				if (!page) return;
				fetched.push(...page.scores);
				after = page.next;
			}
		}
		await Score.replaceServerScores(state.characters, fetched, before);
		await new ScoreSync({
			userId: state.userId, version: state.version,
		}).add();
		console.log(`[scores] rebuilt ${fetched.length} local scores at version ${state.version}`);
	} catch (e) {
		console.warn('[scores] local score rebuild failed', e);
	} finally {
		running = false;
	}
};
