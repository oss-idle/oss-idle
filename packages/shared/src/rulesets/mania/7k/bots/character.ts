import type { Mod } from '../../../../mods.js';
import type { SkillGain } from '../../../../play.js';
import SkillState from '../../../skillState.js';
import CharacterBot, { type ScoreLike } from '../../4k/bots/character.js';
import type { SkillName } from '../../4k/skills.js';
import { makeOrderedSkills } from '../../4k/skills/factory.js';
import Memory from '../../4k/skills/memory.js';
import { tireSkill } from '../../4k/tiring.js';
import {
	Bot,
	type BotContext,
} from '../../bot.js';
import type RuntimeNote from '../../runtimeNote.js';
import type { SimPlay } from '../../sim.js';
import { modXpMultipliers7k } from '../modXp.js';
import {
	type SkillName7k,
	Skills7k,
} from '../skills.js';

/** The 7K skill each 4K skill plays at and earns for. */
const STANDS_FOR: Record<SkillName, SkillName7k> = {
	accuracy: 'accuracy',
	speed: 'speed',
	stamina: 'stamina',
	jackspeed: 'jacks',
	coordination: 'independence',
	release: 'ln',
	reading: 'technical',
	consistency: 'focus',
	concentration: 'focus',
	speedjam: 'sv',
	memory: 'memory',
};

export type ScoreLike7k = ScoreLike;

const skillsAt = ({
	progress, fatigue, warm, plays,
}: SimPlay<SkillName7k>) => makeOrderedSkills().map(skill => {
	const p = progress(STANDS_FOR[skill.name]);
	skill.apply(p);
	skill.lifetimeXp.set(p.lifetimeXp);
	tireSkill(skill, fatigue, warm);
	if (skill instanceof Memory) skill.timesPlayed.set(plays);
	return skill;
});

/** 7K's public bot: 4K's bot on the 7K chart, its skills at their 7K counterparts' levels. */
export default class Bot7k extends Bot {

	private readonly bot: CharacterBot;
	private readonly skills: SkillState<SkillName7k>[];

	constructor(play: SimPlay<SkillName7k>) {
		super();
		this.bot = new CharacterBot(skillsAt(play));
		this.skills = Skills7k.map(name => {
			const skill = new SkillState(name);
			const p = play.progress(name);
			skill.apply(p);
			void skill.lifetimeXp.set(p.lifetimeXp);
			return skill;
		});
	}

	generateEvents(ctx: BotContext) {
		return this.bot.generateEvents(ctx);
	}

	pressOffset(note: RuntimeNote) {
		return this.bot.pressOffset(note);
	}

	releaseOffset(note: RuntimeNote) {
		return this.bot.releaseOffset(note);
	}

	strainsAt(t: number): Readonly<Record<string, number>> {
		const strains: Partial<Record<SkillName7k, number>> = {};
		for (const [skill, strain] of Object.entries(this.bot.strainsAt(t)) as [SkillName, number][]) {
			const name = STANDS_FOR[skill];
			strains[name] = Math.max(strains[name] ?? 0, strain);
		}
		return strains;
	}

	strainedShare(thresholds: Partial<Record<SkillName7k, number>>): number {
		return this.bot.strainedShare(Object.fromEntries(
			(Object.keys(STANDS_FOR) as SkillName[])
				.filter(skill => thresholds[STANDS_FOR[skill]] !== undefined)
				.map(skill => [skill, thresholds[STANDS_FOR[skill]]]),
		));
	}

	getSkillsXP(length: number, score: ScoreLike7k): Record<SkillName7k, number> {
		const xp = Object.fromEntries(Skills7k.map(s => [s, 0])) as Record<SkillName7k, number>;
		const gains = Object.entries(this.bot.getSkillsXP(length, score)) as [SkillName, number][];
		for (const [skill, gained] of gains) {
			xp[STANDS_FOR[skill]] += gained;
		}
		return xp;
	}

	private progression?: SkillGain[];
	/** Earn the play's xp on the bot's skills: a local play's gains. */
	applyProgression(
		length: number,
		score: ScoreLike7k,
		/** debug xp scaling for local plays; the server scales its own */
		xpMultiplier = 1,
		mods: readonly Mod[] = [],
	): SkillGain[] {
		if (this.progression) return this.progression;
		const xp = this.getSkillsXP(length, score);
		const multipliers = modXpMultipliers7k(mods);
		this.progression = this.skills.map(skill => {
			const gained = Math.floor(xp[skill.name] * multipliers[skill.name] * Math.max(1, xpMultiplier));
			const fromLevel = skill.level.get();
			const fromXp = skill.xp.get();
			const levels = skill.gainXP(gained);
			return {
				skill: skill.name, gained, fromLevel, fromXp,
				toLevel: skill.level.get(), toXp: skill.xp.get(), levels,
			};
		});
		return this.progression;
	}
}
