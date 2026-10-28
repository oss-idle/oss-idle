import gaussian from '../../../../math/gaussian.js';
import type { Mod } from '../../../../mods.js';
import type { SkillGain } from '../../../../play.js';
import type SkillState from '../../../skillState.js';
import {
	Bot,
	type BotContext,
} from '../../bot.js';
import type RuntimeNote from '../../runtimeNote.js';
import { modXpMultipliers7k } from '../modXp.js';
import {
	SKILL_7K,
	type SkillName7k,
} from '../skills.js';
import {
	DEMANDS,
	readMap,
} from './demand.js';

/** Placeholder tuning: the 4K rebalance shapes 7K's real numbers. */
const CAP_LEVEL = 110;
const BASE_SIGMA_MS = 45;
const STRAIN_SIGMA = 3;
const MISS_CHANCE = 0.25;
const XP_PER_MINUTE = 1000;
/** every skill's floor share of a play's xp; the rest goes by strain */
const FLOOR_SHARE = 0.4;
/** plays of a map memory needs to learn its SV */
const MEMORY_PLAYS = 12;

type Strains = Record<SkillName7k, number>;

const NO_STRAIN: Readonly<Record<string, number>> = Object.freeze({});

/** What a play's xp is read off: its accuracy, 0 to 1. */
export type ScoreLike7k = { accuracy: number };

/**
 * 7K's bot: each note's demand per skill, less what the character's level handles, is its
 * strain; the hardest one widens that note's timing. Placeholder models (bots/demand.ts).
 */
export default class Bot7k extends Bot {

	private readonly strains = new Map<RuntimeNote, Strains>();
	private readonly blamed = new Map<RuntimeNote, SkillName7k>();
	private notes: RuntimeNote[] = [];

	constructor(
		protected readonly skills: SkillState<SkillName7k>[],
		/** this character's plays of the map: what memory has learned */
		private readonly timesPlayed = 0,
	) {
		super();
	}

	generateEvents(ctx: BotContext) {
		this.analyze(ctx);
		return super.generateEvents(ctx);
	}

	private analyze(ctx: BotContext) {
		const map = readMap(ctx);
		this.notes = ctx.notes;
		for (const note of ctx.notes) {
			const strains = {} as Strains;
			for (const skill of this.skills) {
				const handled = Math.min(1, skill.playLevel() / CAP_LEVEL) * 0.8;
				strains[skill.name] = Math.max(0, DEMANDS[skill.name](note, map) - handled);
			}
			this.strains.set(note, strains);
		}
	}

	/** The note's hardest skill on `side`: LN strains the release, the rest the press. */
	private hardest(note: RuntimeNote, side: 'press' | 'release'): [SkillName7k, number] {
		const strains = this.strains.get(note);
		if (!strains) return [SKILL_7K.accuracy, 0];
		if (side === 'release') return [SKILL_7K.ln, strains.ln];
		let worst: [SkillName7k, number] = [SKILL_7K.accuracy, strains.accuracy];
		for (const [name, strain] of Object.entries(strains) as [SkillName7k, number][]) {
			if (name !== SKILL_7K.memory && strain > worst[1]) worst = [name, strain];
		}
		return worst;
	}

	private offset(note: RuntimeNote, side: 'press' | 'release'): number {
		const [skill, strain] = this.hardest(note, side);
		if (side === 'press') this.blamed.set(note, skill);
		if (Math.random() < strain ** 3 * MISS_CHANCE) return Infinity;
		const accuracy = this.skills.find(s => s.name === SKILL_7K.accuracy);
		const steady = 1 - 0.7 * Math.min(1, (accuracy?.playLevel() ?? 0) / CAP_LEVEL);
		return gaussian(BASE_SIGMA_MS * steady * (1 + STRAIN_SIGMA * strain));
	}

	pressOffset(note: RuntimeNote) {
		return this.offset(note, 'press');
	}

	releaseOffset(note: RuntimeNote) {
		return this.offset(note, 'release');
	}

	/** Each skill's strain at song time `t`, 0 to 1: the last note at or before it. */
	strainsAt(t: number): Readonly<Record<string, number>> {
		let lo = 0;
		let hi = this.notes.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.notes[mid].time <= t) lo = mid + 1;
			else hi = mid;
		}
		return (lo > 0 && this.strains.get(this.notes[lo - 1])) || NO_STRAIN;
	}

	/** The share of the play's notes on which any skill in `thresholds` strained past its threshold. */
	strainedShare(thresholds: Readonly<Record<string, number>>): number {
		if (!this.notes.length) return 0;
		const limits = Object.entries(thresholds) as [SkillName7k, number][];
		const strained = this.notes.filter(note => {
			const strains = this.strains.get(note);
			return strains && limits.some(([skill, limit]) => (strains[skill] ?? 0) > limit);
		});
		return strained.length / this.notes.length;
	}

	/** Each skill's xp for the play, its gear and prestige multiplier applied. */
	getSkillsXP(length: number, score: ScoreLike7k): Record<SkillName7k, number> {
		const total = XP_PER_MINUTE * (length / 60_000) * score.accuracy ** 2;
		const counts = new Map<SkillName7k, number>();
		for (const skill of this.blamed.values()) counts.set(skill, (counts.get(skill) ?? 0) + 1);
		// memory learns the SV a map throws at the character
		const learned = Math.min(1, this.timesPlayed / MEMORY_PLAYS);
		counts.set(SKILL_7K.memory, (counts.get(SKILL_7K.sv) ?? 0) * learned);
		const blamed = Math.max(1, this.blamed.size);
		return Object.fromEntries(this.skills.map(skill => {
			const share = FLOOR_SHARE / this.skills.length
				+ (1 - FLOOR_SHARE) * (counts.get(skill.name) ?? 0) / blamed;
			return [skill.name, Math.floor(total * share * skill.xpMultiplier())];
		})) as Record<SkillName7k, number>;
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
