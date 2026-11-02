import {
	__,
	defineMessages,
} from '../../../i18n/translate.js';
import { EZ_XP } from '../../../mods.js';
import type { FixedLength } from '../../../types/fixed_length.js';
import { gearLabel } from '../gear.js';
import { HR_ACCURACY_XP_7K } from './modXp.js';
import {
	SKILL_7K,
	type SkillName7k,
} from './skills.js';

const SKILL_NAMES = defineMessages({
	accuracy: 'Accuracy',
	speed: 'Speed',
	stamina: 'Stamina',
	jacks: 'Jacks',
	independence: 'Independence',
	ln: 'LN',
	technical: 'Technical',
	focus: 'Focus',
	sv: 'SV',
	memory: 'Memory',
	overall: 'Overall',
} satisfies Record<SkillName7k | 'overall', string>);

/** The player-facing, localized name of a 7K skill. */
export function skillName7k(skill: SkillName7k | 'overall'): string {
	return __(SKILL_NAMES[skill]);
}

const SKILL_DESCRIPTIONS = defineMessages({
	accuracy: 'How accurately you hit the notes as a baseline',
	speed: 'How dense the streams and jumptrills you can keep up with are',
	stamina: 'How long you can keep up with patterns that are too dense for you',
	jacks: 'How fast you repeat keys, alone and in chords',
	independence: 'How well each hand keeps its own rhythm, the thumb on the middle key included',
	ln: 'How well you play while holding LNs, and release them on time',
	technical: 'How well you make out dense patterns on screen without mashing',
	focus: 'How rarely you choke, and how well you stay locked in on long maps',
	sv: 'How comfortable you generally are during SV sections',
	memory: 'Determines how fast and how well you are able to learn SV maps',
} satisfies Record<SkillName7k, string>);

/** What a 7K skill does in a play. */
export function skillDescription7k(skill: SkillName7k): string {
	return __(SKILL_DESCRIPTIONS[skill]);
}

const UPGRADE_DESCRIPTIONS = defineMessages({
	accuracy: 'Upgrade your keyboard to hit all seven keys cleanly',
	speed: 'Get accustomed to higher scroll speeds to perform better',
	stamina: 'Build a better warmup routine to endure long maps',
	jacks: 'Better rollover and switches for chordjacks',
	independence: 'Train your hands to play apart',
	ln: 'Find the perfect LN skin',
	technical: 'Upgrade your monitor to see the notes more clearly',
	focus: 'Shut the world out to stay locked in',
	sv: 'Sharpen your note visuals to read the scroll',
	memory: 'Change your way of learning SV maps',
} satisfies Record<SkillName7k, string>);

/** The player-facing, localized description of a 7K skill's upgrade line. */
export function upgradeDescription7k(skill: SkillName7k): string {
	return __(UPGRADE_DESCRIPTIONS[skill]);
}

/** Each skill's gear, by upgrade level: names translate by key, numbers fill a template. */
export const UPGRADE_7K = defineMessages({
	[SKILL_7K.accuracy]: [
		'Laptop keyboard with a dead spacebar',
		'Rubber dome office keyboard',
		'Logitech K120',
		'Redragon Kumara',
		'HyperX Alloy Origins',
		'Keychron K8',
		'Ducky One 3 TKL',
		'Wooting 60HE',
		'Wooting 80HE',
		'DrunkDeer A75 Pro',
		'Custom hall-effect board',
	],
	[SKILL_7K.speed]: [16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36],
	[SKILL_7K.stamina]: [
		'No warmup',
		'One easy map',
		'Warmup on low dans',
		'Warmup on mid dans',
		'Warmup on high dans',
		'Stamina pack warmup',
		'30 minutes of streams',
		'1 hour pre-session warmup',
		'Forearm strength training',
		'Gym, stretching and meditation',
		'Mid-play stretching and meditation',
	],
	[SKILL_7K.jacks]: [
		'2-key rollover',
		'3-key rollover',
		'6-key rollover',
		'Anti-ghosting',
		'Full N-key rollover',
		'Light linear switches',
		'Speed silver switches',
		'Magnetic switches',
		'Adjustable actuation',
		'Rapid trigger',
		'Per-key rapid trigger',
	],
	[SKILL_7K.independence]: [
		'Both hands in sync',
		'Tapping songs on the desk',
		'Drumming practice',
		'Piano scales',
		'One-hand maps',
		'Polyrhythm drills',
		'Split keyboard',
		'Ergonomic split keyboard',
		'Tented split keyboard',
		'Two keyboards',
		'Thumb cluster keyboard',
	],
	[SKILL_7K.ln]: [
		'Default skin LNs',
		'Bar skin LNs',
		'Thin LN bodies',
		'Short LN tails',
		'No tail LNs',
		'Coloured LN heads',
		'Light percy LNs',
		'Cut percy LNs',
		'LN end indicator',
		'Blank LN bodies',
		'Anchored LN tails',
	],
	[SKILL_7K.technical]: [30, 50, 60, 75, 100, 120, 144, 165, 240, 360, 540],
	[SKILL_7K.focus]: [
		'Noisy room',
		'Used earbuds',
		'Phone on silent',
		'Closed door',
		'Wired headphones',
		'Noise-cancelling headphones',
		'A tidy desk',
		'Do Not Disturb everywhere',
		'Ergonomic chair',
		'Soundproofed room',
		'Flow state',
	],
	[SKILL_7K.sv]: [
		'Default skin notes',
		'Bar skin notes',
		'Circle skin notes',
		'Diamond skin notes',
		'Per-map scroll speed',
		'Column lighting off',
		'Note snap colouring',
		'Music anticipation',
		'Audio focused accuracy',
		'Dynamic sight focus',
		'Constant scroll',
	],
	[SKILL_7K.memory]: [
		'Vibe playing',
		'Passive learning',
		'Bruteforce learning',
		'Watching replays',
		'Map editor studying',
		'Practising sections',
		'Post-it notes',
		'Pattern drawings',
		'Remapping it yourself',
		'Memorizing the whole map',
		'Mental SV palace',
	],
} satisfies Record<SkillName7k, FixedLength<(string | number), 11>>);

const UPGRADE_VALUES: Partial<Record<SkillName7k, string>> = defineMessages({
	technical: '{value}hz Monitor',
	speed: '{value} Scroll Speed',
});

/** The player-facing, localized label for a 7K skill's upgrade at `level`. */
export function upgradeLabel7k(skill: SkillName7k, level: number): string {
	return gearLabel(UPGRADE_7K[skill], UPGRADE_VALUES[skill], level);
}

const PRESTIGE_NOTES: Partial<Record<SkillName7k, string>> =
	defineMessages({ memory: 'Resets every learned map' });

/** What prestiging a 7K skill costs beyond its levels, when it costs more. */
export function prestigeNote7k(skill: SkillName7k): string | undefined {
	const note = PRESTIGE_NOTES[skill];
	return note && __(note);
}

/** The note under 7K's skills list: what else moves a play's xp. */
export function skillsNote7k(): string {
	return __(
		'On top of these, each play\'s XP changes depending on mods (EZ x{ez} on every skill, HR x{hr} on Accuracy) and drops when you replay the same map many times in a day due to mindblock (except Speed, Stamina, Chords, LN and Memory).',
		undefined,
		{
			ez: EZ_XP, hr: HR_ACCURACY_XP_7K,
		},
	);
}
