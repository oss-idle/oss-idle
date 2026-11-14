import num from '../display/num.js';

/** The chat text server-announced when a character takes #1 on a beatmap; the
 *  `perfect` variant is a max (1,000,000) score. Kept pure so it's testable and
 *  shared between the announcer and any future consumer. */
export const firstPlaceMessage = (
	name: string,
	beatmap: { artist: string; title: string; version: string },
	perfect: boolean,
): string =>
	`${name} achieved ${perfect ? 'a perfect rank #1' : 'rank #1'} on ${mapLabel(beatmap)}`;

/** A difficulty as announcements name it: "Artist - Title [Version]". */
export const mapLabel = (beatmap: { artist: string; title: string; version: string }): string =>
	`${beatmap.artist} - ${beatmap.title} [${beatmap.version}]`;

export const billionsMessage = (
	name: string,
	score: number,
): string => `${name} achieved a total ranked score of ${num(score)} !`;

export const ppsMessage = (
	name: string,
	pp: number,
): string => `${name} has reached ${num(pp)}pp !`;

export const skillLevelMessage = (
	name: string,
	skill: string,
	level: number,
): string => `${name} has reached ${skill} level ${level} !`;

/** Announced skill levels: every 10th, then every one from 100 up. */
export const isSkillLevelMilestone = (level: number): boolean =>
	level >= 100 || (level > 0 && level % 10 === 0);