import type {
	BotMatchLive,
	BotMatchStep,
} from '@oss-idle/shared/botMatch';

import type { FitProgress } from './botMatch';

/** Seconds each thing a step goes through takes, before it has shown its own pace. */
const FIRST_GUESS: Record<BotMatchStep, number> = {
	best: 1, history: 1, rest: 2.5, final: 0.15,
};
/** How many things a step goes through, before it knows. */
const TYPICAL: Record<BotMatchStep, number> = {
	best: 200, history: 20, rest: 500, final: 700,
};
const TELL_MS = 1000;

export type LiveMatch = ReturnType<typeof liveMatch>;

/** Keeps a match's progress and how long is left, and tells it about once a second. */
export const liveMatch = (
	tell: (live: BotMatchLive) => void,
	steps: readonly BotMatchStep[],
	now = Date.now,
) => {
	let step = steps[0]!;
	let done = 0;
	let total = 1;
	let levels: Record<string, number> = {};
	let plays = 0;
	let startedAt = now();
	let told = 0;

	const elapsed = () => (now() - startedAt) / 1000;

	/** ponytail: straight lines from each step's pace so far. Keep per-step history if it misleads. */
	const secondsLeft = () => {
		const here = done ? (total - done) * elapsed() / done : total * FIRST_GUESS[step];
		const later = steps.slice(steps.indexOf(step) + 1)
			.reduce((sum, next) => sum + TYPICAL[next] * FIRST_GUESS[next], 0);
		return Math.round(here + later);
	};

	const send = (force: boolean) => {
		if (!force && now() - told < TELL_MS) return;
		told = now();
		tell({
			step, done, total, levels, plays, secondsLeft: secondsLeft(),
		});
	};

	const begin = (next: BotMatchStep, count: number) => {
		step = next;
		done = 0;
		total = count;
		startedAt = now();
		send(true);
	};

	return {
		begin,
		/** How far the step has got. */
		advance: (count: number, outOf = total) => {
			done = count;
			total = outOf;
			send(false);
		},
		played: () => {
			plays++;
			send(false);
		},
		fit: ({ levels: reached, final }: FitProgress) => {
			levels = { ...reached };
			if (final) {
				if (step !== 'final') begin('final', final.total);
				done = final.done;
			}
			send(false);
		},
	};
};
