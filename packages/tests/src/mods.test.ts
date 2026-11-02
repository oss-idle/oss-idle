import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	cleanMods,
	countsForMedals,
	isRankedMods,
	modsKey,
	modsScoreMultiplier,
	parseMods,
	playLabel,
	toggleMod,
	windowScale,
} from '@oss-idle/shared/mods';
import CharacterBot from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import {
	modXp,
	modXpMultipliers,
} from '@oss-idle/shared/rulesets/mania/4k/modXp';
import {
	type SkillName,
	Skills,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import {
	JUDGEMENT,
	type Judgement,
} from '@oss-idle/shared/rulesets/mania/judgement';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { worstAllowed } from '@oss-idle/shared/rulesets/mania/mods';
import {
	maniaWindows,
	ScoreState,
} from '@oss-idle/shared/rulesets/mania/scoring';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';

import {
	CHARTS,
	getBeatmap,
	loadBeatmap,
} from './balancing/charts';

await loadBeatmap(CHARTS['4-blu']);

const scored = (worst: Judgement | undefined, judgements: Judgement[]) => {
	const s = new ScoreState(5, 8, judgements.length, false, 1, false, 1, worst);
	for (const j of judgements) s.add(j);
	return s;
};

const bot = (level: number) => {
	const skills = makeOrderedSkills();
	for (const skill of skills) skill.level.set(level);
	return new CharacterBot(skills);
};

describe('mod rules', () => {
	it('keeps osu!\'s conflicts: the mod turned on wins', () => {
		expect(toggleMod(['EZ', 'SD'], 'HR')).toEqual(['HR', 'SD']);
		expect(toggleMod(['SD'], 'PF')).toEqual(['PF']);
		expect(toggleMod(['PF'], 'NF')).toEqual(['NF']);
		expect(toggleMod(['HR', 'PF'], 'JT')).toEqual(['HR', 'JT']);
		expect(toggleMod(['HR', 'SD'], 'SD')).toEqual(['HR']);
		expect(cleanMods(['SD', 'EZ', 'SD', 'HR', 'XX'])).toEqual(['EZ', 'SD']);
	});

	it('stores and reads back', () => {
		expect(modsKey(['SD', 'HR'])).toBe('HR,SD');
		expect(parseMods('HR,SD')).toEqual(['HR', 'SD']);
		expect(parseMods('')).toEqual([]);
		expect(playLabel(['HR', 'SD'], 1.2)).toBe('HRSD x1.2');
		expect(playLabel([], 1)).toBe('');
	});

	it('NF alone is unranked; EZ keeps 0.3 of the score', () => {
		expect(isRankedMods(['NF'])).toBe(false);
		expect(isRankedMods(['EZ', 'PF'])).toBe(true);
		expect(modsScoreMultiplier(['EZ', 'SD'])).toBe(0.3);
	});

	it('HR and EZ scale every window by 1.4', () => {
		const plain = maniaWindows(8, true);
		const hard = maniaWindows(8, true, windowScale(['HR']));
		const easy = maniaWindows(8, true, windowScale(['EZ']));
		for (const j of Object.keys(plain) as Judgement[]) {
			expect(hard[j]).toBeCloseTo(plain[j] / 1.4);
			expect(easy[j]).toBeCloseTo(plain[j] * 1.4);
		}
	});

	it('SD fails on a miss, PF below perfect, JT below marvelous', () => {
		const sd = worstAllowed(['SD']);
		expect(scored(sd, [JUDGEMENT.BAD, JUDGEMENT.GOOD]).failed).toBe(false);
		expect(scored(sd, [JUDGEMENT.GREAT, JUDGEMENT.MISS]).failedIndex).toBe(2);
		const pf = worstAllowed(['PF']);
		expect(scored(pf, [JUDGEMENT.MARVELOUS, JUDGEMENT.PERFECT]).failed).toBe(false);
		expect(scored(pf, [JUDGEMENT.PERFECT, JUDGEMENT.GREAT]).failedIndex).toBe(2);
		const jt = worstAllowed(['JT']);
		expect(scored(jt, [JUDGEMENT.DIVINE, JUDGEMENT.MARVELOUS]).failed).toBe(false);
		expect(scored(jt, [JUDGEMENT.MARVELOUS, JUDGEMENT.PERFECT]).failedIndex).toBe(2);
	});

	it('EZ halves every skill\'s xp, HR adds a tenth to accuracy', () => {
		const xp = () => Object.fromEntries(Skills.map(s => [s, 100])) as Record<SkillName, number>;
		expect(modXp(xp(), ['EZ'])).toEqual(Object.fromEntries(Skills.map(s => [s, 50])));
		const hard = modXp(xp(), ['HR']);
		expect(hard.accuracy).toBe(110);
		expect(hard.speed).toBe(100);
	});

	it('mod select\'s xp multipliers: NF earns nothing', () => {
		expect(modXpMultipliers(['HR', 'PF'])).toMatchObject({
			accuracy: 1.1, speed: 1,
		});
		expect(modXpMultipliers(['EZ']).memory).toBe(0.5);
		expect(Object.values(modXpMultipliers(['NF']))).toEqual(Skills.map(() => 0));
	});

	it('EZ and NF plays earn no play medals', () => {
		expect(countsForMedals(['EZ', 'SD'])).toBe(false);
		expect(countsForMedals(['NF'])).toBe(false);
		expect(countsForMedals(['HR', 'PF'])).toBe(true);
	});
});

describe('mods in the simulation', () => {
	const chart = getBeatmap(CHARTS['4-blu']);

	it('SD ends the play at its first miss; a match round plays on', () => {
		const solo = new ManiaGame(chart, bot(0), { mods: ['SD'] });
		solo.update(solo.songEndMs + 1000);
		expect(solo.score.failed).toBe(true);
		expect(solo.hits.at(-1)!.judgement).toBe(JUDGEMENT.MISS);
		expect(solo.hits.length).toBeLessThan(solo.totalNotes);

		const round = new ManiaGame(chart, bot(0), {
			mods: ['SD'], playOn: true,
		});
		round.update(round.songEndMs + 1000);
		expect(round.score.failed).toBe(true);
		expect(round.hits.length).toBe(round.totalNotes);
	});

	it('xp reads an HR play judged at the map\'s own windows', () => {
		const game = new ManiaGame(chart, bot(60), {
			mods: ['HR'], noFail: true,
		});
		game.update(game.songEndMs + 1000);
		const plain = xpScore(chart, game, { mods: ['HR'] });
		expect(plain).not.toBe(game.score);
		expect(plain.accuracy).toBeGreaterThan(game.score.accuracy);
		expect(xpScore(chart, game, {})).toBe(game.score);
	});
});
