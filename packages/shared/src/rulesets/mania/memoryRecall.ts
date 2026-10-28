/** Plays each memory upgrade forgets. */
export const FORGET_PLAYS = 10;

/** Share of a map's plays forgotten each day it goes untouched (Adri,
 *  2026-10-25: "natural decay for memory tries on maps"). */
export const DAILY_DECAY = 0.05;
export const DAY_MS = 86_400_000;

/** What is left of `plays` after `ms` untouched. */
export const decayed = (plays: number, ms: number): number =>
	plays * (1 - DAILY_DECAY) ** (Math.max(0, ms) / DAY_MS);

/** When a map was played: a pass, or a fail and the share of the map it reached. */
export type Played = number | { at: number, share: number };

/** Plays that still train memory, from a map's plays and the times memory
 *  upgrades were bought (each forgets {@link FORGET_PLAYS}), fading by
 *  {@link DAILY_DECAY} between them and up to `now`. */
export const recall = (
	played: readonly Played[], forgetAt: readonly number[], now = Date.now(),
): number => {
	const events = [
		...played.map(p => (typeof p === 'number' ? {
			t: p, share: 1, forget: false,
		} : {
			t: p.at, share: p.share, forget: false,
		})),
		...forgetAt.map(t => ({
			t, share: 0, forget: true,
		})),
	].sort((a, b) => a.t - b.t);
	let plays = 0;
	let last = events[0]?.t ?? now;
	for (const e of events) {
		plays = decayed(plays, e.t - last);
		last = e.t;
		plays = e.forget ? Math.max(0, plays - FORGET_PLAYS) : plays + e.share;
	}
	return decayed(plays, now - last);
};
