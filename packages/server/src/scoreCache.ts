import { env } from './env';
import type { OsuMapScore } from './osu/api';

const TIMEOUT_MS = 60_000;

/** Hands scores read from osu! to the score cache. Nothing depends on it getting there. */
export const feedScoreCache = async (scores: readonly OsuMapScore[]): Promise<void> => {
	if (!env.SCORE_CACHE_URL || !scores.length) return;
	try {
		const res = await fetch(`${env.SCORE_CACHE_URL}/scores`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.SCORE_CACHE_SECRET}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ scores }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!res.ok) console.warn(`score cache: ${res.status}`);
	} catch (e) {
		console.warn(`score cache: ${(e as Error).message}`);
	}
};
