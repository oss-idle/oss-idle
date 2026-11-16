import type { ReactNode } from 'react';

import type { BigLike } from '../big.js';
import {
	levelProgress,
	xpGivesLevel,
} from '../xp.js';

/**
 * How a level is drawn, everywhere in the game. One place on purpose: these
 * rules are easy to lose track of, and a level that renders differently in one
 * screen reads as a bug.
 *
 * 1. Colour comes from the ramp in shared.css, `.level_100` .. `.level_110`.
 * 2. Past the top of the ramp a level keeps its last colour. It must never fall
 *    through to no colour at all - the effective level runs well past 110.
 * 3. Under the bottom of the ramp a level is a plain number and takes its colour
 *    from whatever contains it.
 * 4. Progress inside the level trails as decimals, faded in proportion to it,
 *    and only once the level is on the ramp.
 */

/** Bottom of the colour ramp in shared.css: no colour, no decimals below it. */
export const LEVEL_COLOUR_MIN = 100;
/** Top of it: levels above keep this colour rather than losing it. */
export const LEVEL_COLOUR_MAX = 110;

export const levelClass = (level: number): string =>
	`level_container level_${Math.min(Math.floor(level), LEVEL_COLOUR_MAX)}`;


/** A level and how far into it the character is, drawn by the rules above. */
export const levelNode = (level: number, progress: number): ReactNode => {
	const whole = Math.floor(level);
	if (whole < LEVEL_COLOUR_MIN) return String(whole);

	const part = Math.floor(progress * 100);
	return <span className={levelClass(whole)}>{whole}
		{part > 0 && (
			<span className='level_part' style={{ opacity: 0.5 + 0.5 * (part / 100) }}>
				.{String(part).padStart(2, '0')}
			</span>
		)}
	</span>;
};

/** The same, for a level paired with the xp banked inside it. */
export const levelFromXp = (level: number, xp: BigLike): ReactNode =>
	levelNode(level, levelProgress(level, xp));

/** The same, for a lifetime xp total: the level all of it would be worth. */
export const levelFromTotalXp = (totalXp: BigLike): ReactNode => {
	const { level, xp } = xpGivesLevel(totalXp);
	return levelFromXp(level, xp);
};
