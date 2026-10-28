import '@oss-idle/shared/osu/controlPointPatch';

import {
	afterEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import CharacterBot from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import Memory from '@oss-idle/shared/rulesets/mania/4k/skills/memory';
import { tireSkill } from '@oss-idle/shared/rulesets/mania/4k/tiring';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { publicSims } from '@oss-idle/shared/rulesets/mania/sims';
import { xpScore } from '@oss-idle/shared/rulesets/mania/xpScore';
import type { UpgradeState } from '@oss-idle/shared/upgrades';

import {
	CHARTS,
	loadBeatmap,
} from './balancing/charts';

/**
 * The server plays through the sim contract (server/src/sim.ts). With the public sim
 * behind it, a play must be exactly the one the server built by hand before the seam.
 */

const mulberry32 = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const STATES = [
	{
		level: 20, prestige: 0, fatigue: 0, warm: 1, plays: 0,
	},
	{
		level: 75, prestige: 2, fatigue: 0.4, warm: 0.7, plays: 6,
	},
];

/** The skills as the server loaded them before the seam. */
const byHand = (
	progress: (s: SkillName) => UpgradeState & { lifetimeXp: number },
	fatigue: number,
	warm: number,
	plays: number,
) => {
	const skills = makeOrderedSkills();
	for (const skill of skills) {
		const p = progress(skill.name);
		skill.level.set(p.level);
		skill.xp.set(p.xp);
		skill.upgrades.set(p.upgrades);
		skill.overdrive.set(p.overdrive);
		skill.prestige.set(p.prestige);
		skill.lifetimeXp.set(p.lifetimeXp);
		tireSkill(skill, fatigue, warm);
		if (skill instanceof Memory) skill.timesPlayed.set(plays);
	}
	return new CharacterBot(skills);
};

const play = async (bot: CharacterBot | ReturnType<typeof publicSims.mania4k.bot>) => {
	vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
	const chart = await loadBeatmap(CHARTS['4-blu']);
	const game = new ManiaGame(chart, bot, {});
	game.update(game.songEndMs + 1000);
	const xp = bot.getSkillsXP(chart.totalLength, xpScore(chart, game, {}));
	vi.restoreAllMocks();
	return {
		score: game.score.score, counts: game.score.counts, failed: game.score.failed, xp,
	};
};

describe('the public sim through the contract', () => {
	afterEach(() => void vi.restoreAllMocks());

	for (const {
		level, prestige, fatigue, warm, plays,
	} of STATES) {
		it(`plays like the hand-built bot at L${level}`, async () => {
			const progress = () => ({
				level, xp: 0, upgrades: 3, overdrive: 0, prestige, lifetimeXp: 0,
			});
			const before = await play(byHand(progress, fatigue, warm, plays));
			const after = await play(publicSims.mania4k.bot({
				progress, fatigue, warm, plays,
			}));
			expect(after).toEqual(before);
			expect(before.score).toBeGreaterThan(0);
		});
	}
});

describe('the strain view through the contract', () => {
	afterEach(() => void vi.restoreAllMocks());

	it('combines into the play the bot makes', async () => {
		const sim = {
			progress: () => ({
				level: 40, xp: 0, upgrades: 3, overdrive: 0, prestige: 0, lifetimeXp: 0,
			}),
			fatigue: 0,
			warm: 1,
			plays: 0,
		};
		const played = await play(publicSims.mania4k.bot(sim));
		vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
		const { series } = publicSims.mania4k.analyze!(sim, await loadBeatmap(CHARTS['4-blu']), {});
		expect(series.map(s => s.name)).toEqual([...makeOrderedSkills().map(s => s.name), 'combined']);
		expect(series.at(-1)!.score.score).toBe(played.score);
		expect(series.at(-1)!.score.counts).toEqual(played.counts);
	});
});
