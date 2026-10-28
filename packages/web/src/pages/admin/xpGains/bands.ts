import { skillName } from '@oss-idle/shared/rulesets/mania/4k/display';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { xpGainBand } from '@oss-idle/shared/xp';

import type { AdminXpGains } from '../../../api/admin';

export type Band = {
	label: string,
	from: number,
	to: number,
	/** plays and raw xp, one per skill */
	cells: { plays: number, xp: number }[],
};

export type XpBands = { skills: readonly string[], bands: Band[] };

/** Ten levels a band below 100, one per level from there. */
const PER_LEVEL_FROM = 100;
const WIDTH = 10;


/** The rows in bands: every 10-level band below 100, then each level up to the highest played. */
export const bandsOf = ({ skills, rows }: AdminXpGains): XpBands => {
	const top = Math.max(PER_LEVEL_FROM - 1, ...rows.map(r => r.level));
	const bands: Band[] = [];
	for (let from = 0; from <= top; from = from < PER_LEVEL_FROM ? from + WIDTH : from + 1) {
		const to = from < PER_LEVEL_FROM ? from + WIDTH - 1 : from;
		bands.push({
			label: from === to ? String(from) : `${from}–${to}`,
			from,
			to,
			cells: skills.map(() => ({
				plays: 0, xp: 0, 
			})),
		});
	}
	const at = new Map(bands.map((b, i) => [b.from, i]));
	for (const row of rows) {
		const skill = skills.indexOf(row.skill);
		const band = at.get(xpGainBand(Math.max(0, row.level)));
		if (skill < 0 || band === undefined) continue;
		bands[band].cells[skill].plays += row.plays;
		bands[band].cells[skill].xp += row.xp;
	}
	return {
		skills, bands, 
	};
};

/** XP per play in a band, undefined with no plays. */
export const perPlay = (band: Band, skill: number): number | undefined => {
	const { plays, xp } = band.cells[skill];
	return plays ? xp / plays : undefined;
};

export const accuracyOf = (data: XpBands) => data.skills.indexOf('accuracy');

export const labelOf = (data: XpBands, skill: number) => skillName(data.skills[skill] as SkillName);

/** Where a band sits on the level axis. */
export const midOf = (band: Band) => (band.from + band.to) / 2;

/** Under this many plays a band's average is noise. */
export const FEW_PLAYS = 20;

/** log10 of the smallest and largest XP per play anywhere. */
export const extentOf = (data: XpBands): [number, number] => {
	const all = data.bands
		.flatMap(b => data.skills.map((_, i) => perPlay(b, i) ?? 0))
		.filter(v => v > 0);
	return all.length ? [Math.log10(Math.min(...all)), Math.log10(Math.max(...all))] : [0, 1];
};
