import sum from '../../helpers/sum.js';
import {
	evenModXp,
	modsLabel,
} from '../../mods.js';
import {
	skillDescription,
	skillName,
	upgradeDescription,
	upgradeLabel,
} from '../mania/4k/display.js';
import { NO_MEDALS } from '../medalsNone.js';
import type { RulesetDef } from '../ruleset.js';

/** osu!'s judgements, best first: 300, 100, 50, miss. */
export const OsuJudgements = ['GREAT', 'OK', 'MEH', 'MISS'] as const;
export type OsuJudgement = typeof OsuJudgements[number];
const WORTH: Record<OsuJudgement, number> = {
	GREAT: 300, OK: 100, MEH: 50, MISS: 0,
};

/** Standard's skills: a placeholder until its own skill set exists. */
export const OsuSkills = ['accuracy'] as const;
export type OsuSkill = typeof OsuSkills[number];

/** osu!standard, for testing the ruleset boundary: no engine yet. Dev only. */
export const osu = {
	id: 'osu',
	judgements: OsuJudgements,
	miss: 'MISS',
	skills: OsuSkills,
	accuracyOf: counts => sum(OsuJudgements.map(j => WORTH[j] * counts[j]))
		/ Math.max(1, 300 * sum(OsuJudgements.map(j => counts[j]))),
	skillName,
	skillDescription,
	upgradeDescription,
	upgradeLabel,
	modXpMultipliers: mods => evenModXp(OsuSkills, mods),
	prestigeNote: () => undefined,
	skillsNote: () => '',
	physicalSkills: [],
	gauged: [],
	performanceArgs: ({ maxCombo, counts }, rate = 1, mods = []) => ({
		lazer: false,
		clockRate: rate,
		mods: modsLabel(mods),
		combo: maxCombo,
		n300: counts.GREAT,
		n100: counts.OK,
		n50: counts.MEH,
		misses: counts.MISS,
	}),
	medals: NO_MEDALS,
} as const satisfies RulesetDef<OsuJudgement, OsuSkill>;
