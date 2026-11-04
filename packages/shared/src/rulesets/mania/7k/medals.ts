import {
	type MedalCategory,
	type MedalDef,
	medalDef as def,
} from '../../../achievements/catalogue.js';
import type { GlyphName } from '../../../achievements/glyphs.js';
import {
	MEDAL_LINES,
	MEDALS,
} from '../4k/medals.js';
import { Skills } from '../4k/skills.js';
import {
	type SkillName7k,
	Skills7k,
} from './skills.js';

/** 7K's ids: they never collide with another ruleset's (a title stores only the id). */
export const MEDAL_PREFIX_7K = '7k-';

export const SKILL_GLYPHS_7K: Record<SkillName7k, GlyphName> = {
	accuracy: 'target',
	speed: 'lightning',
	stamina: 'heartbeat',
	jacks: 'keyboard',
	independence: 'handFist',
	ln: 'wind',
	technical: 'eye',
	focus: 'brain',
	sv: 'waveform',
	memory: 'fingerprint',
};

/** 4K's medals 7K has no twin of: ones tied to particular maps, and rebirth (none in 7K). */
const LEFT_OUT = new Set(['possessed', 'parallax', 'wonderful', 'rebirth']);

const isSkillMedal = (id: string) =>
	(Skills as readonly string[]).includes(id.replace(/-\d+$/, ''));

const SKILL_STEPS = [
	[50, 'silver'],
	[100, 'gold'],
	[105, 'platinum'],
	[110, 'divine'],
] as const;

const at = (id: string) => `${MEDAL_PREFIX_7K}${id}`;

/** 7K's medals: the same kinds as 4K's, its own skills in the mastery rows. */
export const MEDALS_7K: MedalDef[] = [
	...MEDALS
		.filter(m => !LEFT_OUT.has(m.id) && !isSkillMedal(m.id))
		.map(m => def(at(m.id), m.category, m.tier, m.glyph)),
	...Skills7k.flatMap(skill => SKILL_STEPS.map(([n, tier]) =>
		def(at(`${skill}-${n}`), 'mastery', tier, SKILL_GLYPHS_7K[skill]))),
];

export const MEDAL_LINES_7K: Record<MedalCategory, string[][]> = Object.fromEntries(
	Object.entries(MEDAL_LINES).map(([category, lines]) => [category, [
		// 4K's skill rows become 7K's, in place
		...lines
			.map(line => line.filter(id => !LEFT_OUT.has(id)))
			.filter(line => line.length)
			.map(line => isSkillMedal(line[0])
				? Skills7k.map(skill => `${skill}-${line[0].split('-').pop()}`)
				: line),
	].map(line => line.map(at))]),
) as Record<MedalCategory, string[][]>;
