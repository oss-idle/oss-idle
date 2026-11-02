import type { Grade } from './grade.js';
import type { Mod } from './mods.js';
import { RING } from './rulesets/mania/4k/genes.js';
import {
	SKILL,
	type SkillName,
} from './rulesets/mania/4k/skills.js';
import {
	levelProgress,
	xpForLevel,
	xpGivesLevel,
	xpToLevel,
} from './xp.js';

/** Real scores can't show these. */
const UNMEASURED: readonly SkillName[] = [
	SKILL.speedjam, SKILL.memory, SKILL.consistency, SKILL.concentration,
];

/** The skills a match measures, round the genetic ring. */
export const BOT_MATCH_SKILLS: readonly SkillName[] = RING
	.filter(skill => !UNMEASURED.includes(skill));

export const BOT_MATCH_JUDGEMENTS = [
	'MARVELOUS', 'PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS',
] as const;
export type BotMatchCounts = Record<(typeof BOT_MATCH_JUDGEMENTS)[number], number>;

/** One of the bot's best plays. */
export type BotTopScore = {
	beatmapId: number,
	setId: number,
	title: string,
	artist: string,
	version: string,
	mods: Mod[],
	rate: number,
	grade: Grade,
	pp: number,
	accuracy: number,
	/** the player's own, on the same map */
	realAccuracy: number,
};

export type BotMatchResult = {
	username: string,
	avatarUrl?: string,
	/** the player's osu!mania 4K rank and pp, when they had them */
	rank?: number,
	pp?: number,
	levels: Record<string, number>,
	overall: number,
	/** scores it was fitted on, and how many of them the bot reached */
	plays: number,
	reached: number,
	/** judgements added up over the scores it reached */
	real: BotMatchCounts,
	bot: BotMatchCounts,
	/** the bot's plays added up the way a character's are */
	performance: number,
	top: BotTopScore[],
};

/** Where the bot would stand on the game's boards today. */
export type BotMatchRanks = {
	performance: number,
	overall: number,
	skills: Record<string, number>,
};

/** A first result from the player's best scores, shown at once. */
export const BOT_FIRST_STEPS = ['best', 'final'] as const;
/** Then the rest of their scores, which osu! only gives slowly. */
export const BOT_REFINE_STEPS = ['history', 'rest', 'final'] as const;
export type BotMatchStep = (typeof BOT_FIRST_STEPS | typeof BOT_REFINE_STEPS)[number];

/** A running match, as far as it has got. */
export type BotMatchLive = {
	step: BotMatchStep,
	done: number,
	total: number,
	/** the level each skill has climbed to: nothing yet at 0 */
	levels: Record<string, number>,
	/** plays the bot has played so far */
	plays: number,
	secondsLeft: number,
};

export const BOT_MATCH_STATUS = ['queued', 'running', 'refining', 'done', 'failed'] as const;
export type BotMatchStatus = (typeof BOT_MATCH_STATUS)[number];

export const BOT_MATCH_FAILURE = ['too_few_plays', 'unavailable'] as const;
export type BotMatchFailure = (typeof BOT_MATCH_FAILURE)[number];

/** The match so far: a skill not measured yet has no level. */
export const botLiveLevels = (live: Pick<BotMatchLive, 'levels'>): Record<string, number> =>
	Object.fromEntries(BOT_MATCH_SKILLS.map(skill => [skill, live.levels[skill] ?? 0]));

/** All the xp a character at these levels has earned. */
export const botOverallXp = (levels: Record<string, number>): number =>
	Object.values(levels).reduce((sum, level) => {
		const whole = Math.floor(level);
		return sum + xpToLevel(whole) + (level - whole) * xpForLevel(whole);
	}, 0);

/** That xp, as one level. */
export const botOverall = (levels: Record<string, number>): number => {
	const { level, xp } = xpGivesLevel(botOverallXp(levels));
	return level + levelProgress(level, xp);
};

/** shared.css's `.level_100` .. `.level_110`, for what can't take a class. */
const LEVEL_RAMP = [
	'rgb(238, 198, 240)', 'rgb(201, 143, 228)', 'rgb(147, 102, 212)', 'rgb(101, 91, 214)',
	'rgb(179, 82, 200)', 'rgb(231, 76, 176)', 'rgb(255, 86, 147)', 'rgb(255, 111, 118)',
	'rgb(255, 144, 92)', 'rgb(255, 179, 76)', 'rgb(255, 212, 77)',
];

/** A level's colour once on the ramp: past its top it keeps the last one. */
export const levelColour = (level: number): string | undefined => level < 100
	? undefined
	: LEVEL_RAMP[Math.min(Math.floor(level), 110) - 100];

export const BOT_GRAPH_LINE = '#ff66ab';
export const BOT_GRAPH_SIZE = {
	width: 660, height: 630, cx: 330, cy: 325,
};
const HUB = 52;
const EDGE = 258;
const TOP_LEVEL = 130;
const LABEL_GAP = 10;
const LABEL_HEIGHT = 17;
const NUMBER_GAP = 34;
/** A number is wide: on the sides of the graph it needs this much more room. */
const NUMBER_WIDE = 28;
/** Any nearer the middle, a number runs into the overall: it goes outside its line. */
const NUMBER_NEAREST = 100;
/** Any nearer the middle, the names no longer fit around the graph. */
const LABEL_NEAREST = 178;

const f1 = (value: number) => value.toFixed(1);

/** Where a level sits: 130 on the outer edge, 100 well inside it. */
const radiusOf = (level: number) => HUB + (EDGE - HUB) * Math.min(level, TOP_LEVEL) / TOP_LEVEL;

const at = (radius: number, turn: number) => {
	const angle = turn * 2 * Math.PI / BOT_MATCH_SKILLS.length - Math.PI / 2;
	return [
		BOT_GRAPH_SIZE.cx + radius * Math.cos(angle),
		BOT_GRAPH_SIZE.cy + radius * Math.sin(angle),
	] as const;
};

/** What a name runs along, just outside its own slice: under the middle it runs the other way,
 *  so it never reads upside down. */
const labelPath = (radius: number, turn: number) => {
	const under = at(radius, turn)[1] > BOT_GRAPH_SIZE.cy;
	const r = Math.max(radius + LABEL_GAP, LABEL_NEAREST) + (under ? LABEL_HEIGHT : 0);
	const [x0, y0] = at(r, under ? turn + 1 : turn - 1);
	const [x1, y1] = at(r, under ? turn - 1 : turn + 1);
	return `M${f1(x0)} ${f1(y0)}A${f1(r)} ${f1(r)} 0 0 ${under ? 0 : 1} ${f1(x1)} ${f1(y1)}`;
};

/** The stepped graph, drawn the same on the page and on the card: each skill holds its level
 *  across its own slice, and the line steps to the next. */
export const botGraph = (levels: Record<string, number>, nameOf: (skill: SkillName) => string) => {
	const count = BOT_MATCH_SKILLS.length;
	return BOT_MATCH_SKILLS.map((skill, i) => {
		const level = levels[skill] ?? 0;
		const radius = radiusOf(level);
		const [x0, y0] = at(radius, i - 0.5);
		const [x1, y1] = at(radius, i + 0.5);
		const next = radiusOf(levels[BOT_MATCH_SKILLS[(i + 1) % count]!] ?? 0);
		const [nx, ny] = at(next, i + 0.5);
		const wide = NUMBER_WIDE * Math.abs(at(1, i)[0] - BOT_GRAPH_SIZE.cx);
		const inside = radius - NUMBER_GAP - wide;
		const outside = inside < NUMBER_NEAREST;
		const numberRadius = outside ? radius + NUMBER_GAP + wide : inside;
		const [numberX, numberY] = at(numberRadius, i);
		const r = f1(radius);
		return {
			skill,
			arc: `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 0 1 ${f1(x1)} ${f1(y1)}`,
			step: `M${f1(x1)} ${f1(y1)}L${f1(nx)} ${f1(ny)}`,
			colour: levelColour(level) ?? BOT_GRAPH_LINE,
			name: nameOf(skill),
			labelPath: labelPath(outside ? numberRadius + NUMBER_GAP + wide : radius, i),
			number: {
				x: numberX, y: numberY,
			},
		};
	});
};
