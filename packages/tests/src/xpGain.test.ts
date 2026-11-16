import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import {
	Big,
	toText,
} from '@oss-idle/shared/big';
import CharacterBot from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import SkillState from '@oss-idle/shared/rulesets/skillState';
import { xpGivesLevel } from '@oss-idle/shared/xp';
import { scaleXp } from '@oss-idle/shared/xpGain';

describe('scaleXp', () => {
	it('floors raw x multiplier, past 1e300', () => {
		expect(toText(scaleXp({ a: 3000 }, () => Big.from(1.1).pow(8000)).a)).toMatch(/e33/);
		expect(scaleXp({ a: 10 }, () => Big.from(1.15)).a.toNumber()).toBe(11);
	});

	it('gives zero, never NaN, for no raw xp', () => {
		expect(scaleXp({ a: 0 }, () => Big.from('1e5000')).a.isZero()).toBe(true);
	});
});

describe('applyProgression', () => {
	it('floors raw x multiplier once', () => {
		const bot = new CharacterBot(makeOrderedSkills());
		vi.spyOn(bot, 'getRawXP').mockReturnValue({
			...Object.fromEntries(Skills.map(s => [s, 0])), speed: 10.9,
		} as ReturnType<CharacterBot['getRawXP']>);
		const gains = bot.applyProgression(1, {
			accuracy: 1, MISS: 0,
		}, 1e6);
		const speed = gains.find(g => g.skill === 'speed')!;
		expect(speed.gained.toNumber()).toBe(Math.floor(10.9 * 1e6));
	});
});

describe('SkillState.gainXP', () => {
	it('lands where the total says, past 1e300', () => {
		const s = new SkillState('speed');
		s.gainXP(Big.from('1e300'));
		expect(s.level.get()).toBe(xpGivesLevel(Big.from('1e300')).level);
		expect(toText(s.lifetimeXp.get())).toBe('1e300');
	});
});
