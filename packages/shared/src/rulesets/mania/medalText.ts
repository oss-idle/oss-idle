import num from '../../display/num.js';
import {
	__,
	defineMessages,
} from '../../i18n/translate.js';

/* Mania's medal names and descriptions, by id: a ruleset's catalogue reads them through
 * medalText with its id prefix and its skills. */

const NAMES = defineMessages({
	'pass-1': 'First Steps',
	'pass-2': 'Finding the Beat',
	'pass-3': 'Keeping Up',
	'pass-4': 'Hands Awake',
	'pass-5': 'Into the Storm',
	'pass-6': 'Wall of Notes',
	'pass-7': 'Beyond Reason',
	'pass-8': 'Eight Stars Up',
	'pass-9': 'Nine Lives',
	'pass-10': 'Ten-Star Legend',
	'fc-1': 'Clean Start',
	'fc-2': 'Unbroken',
	'fc-3': 'Steady Hands',
	'fc-4': 'Flawless Flow',
	'fc-5': 'Iron Combo',
	'fc-6': 'Glass Cannon',
	'fc-7': 'Perfect Storm',
	'fc-8': 'Untouchable',
	'fc-9': 'Beyond Perfect',
	'fc-10': 'Absolute',
	'grade-ss': 'Spotless',
	'grade-x': 'Crystal Clear',
	'grade-xx': 'Divine Touch',
	rice: 'Rice Cooker',
	ln: 'Hold the Line',
	'plays-100': 'Warming Up',
	'plays-1k': 'Regular',
	'plays-5k': 'Devoted',
	'plays-25k': 'No Life',
	'plays-100k': 'Eternal',
	'hits-100k': 'Tapping Away',
	'hits-1m': 'Million Taps',
	'hits-10m': 'Worn Switches',
	'hits-50m': 'Keyboard Breaker',
	'hits-1b': 'Billion Club',
	'time-10h': 'Time Flies',
	'time-100h': 'Where Did The Day Go',
	'time-1000h': 'Lifer',
	'time-10000h': 'Ten Thousand Hours',
	'friends-1': 'Familiar Face',
	'friends-5': 'Friendly',
	'friends-25': 'Popular',
	'friends-100': 'Crowd Favourite',
	'friends-1k': 'Icon',
	'overall-25': 'Well Rounded',
	'overall-50': 'Halfway There',
	'overall-75': 'Seasoned',
	'overall-100': 'Centurion',
	'overall-105': 'Overachiever',
	'overall-110': 'Ascendant',
	'upgrades-1': 'Gearing Up',
	'upgrades-10': 'Shopping Spree',
	'upgrades-50': 'Big Spender',
	'upgrades-100': 'Fully Loaded',
	'ladders-1': 'Top of the Line',
	'ladders-5': 'Kitted Out',
	'ladders-10': 'Perfectionist',
	'ladders-11': 'Completionist',
	'overdrive-2': 'Redline',
	'overdrive-10': 'Overclocked',
	'overdrive-100': 'Meltdown',
	'overdrive-1000': 'Singularity',
	'prestige-1': 'Fresh Start',
	'prestige-5': 'Again and Again',
	'prestige-25': 'Prestigious',
	'prestige-100': 'Eternal Return',
	rebirth: 'Born Again',
	'first-1': 'Number One',
	'first-10': 'Collector',
	'first-100': 'Royalty',
	'first-1000': 'Undisputed',
	'pp-1k': 'Liftoff',
	'pp-5k': 'High Orbit',
	'pp-10k': 'Escape Velocity',
	'pp-20k': 'Beyond the Stars',
	'top-75': 'In the Running',
	'top-50': 'Upper Half',
	'top-25': 'Top Quarter',
	'top-10': 'Elite',
	'top-1': 'One Percent',
	'play-pp-50': 'First Spark',
	'play-pp-100': 'Triple Digits',
	'play-pp-200': 'Heating Up',
	'play-pp-500': 'Wildfire',
	'play-pp-750': 'Inferno',
	'play-pp-1k': 'Supernova',
	'curator-1': 'Curator',
	'curator-5': 'Talent Scout',
	'curator-25': 'Tastemaker',
	'curator-100': 'Archivist',
	'mapper-1': 'Mapper',
	'mapper-2': 'Encore',
	'mapper-5': 'Craftsman',
	'mapper-10': 'Cartographer',
	'mapper-50': 'Architect',
	'mapper-100': 'Living Legend',
	'combo-727': 'When You See It',
	'same-map-100': 'Broken Record',
	'fail-99': 'So Close',
	'fail-10s': 'False Start',
	'night-owl': 'Night Owl',
	'first-chat': 'Hello World',
	possessed: 'Possessed',
	parallax: 'Future Sequence',
	wonderful: 'Wonderful',
});

const DESCRIPTIONS = defineMessages({
	'grade-ss': 'Get an SS on an approved map',
	'grade-x': 'Get an X on an approved map',
	'grade-xx': 'Get an XX on an approved map',
	rice: 'Pass a 4★ or harder map made of over 90% single notes',
	ln: 'Pass a 4★ or harder map made of over 50% long notes',
	'upgrades-1': 'Buy your first upgrade',
	'ladders-1': 'Max out the upgrades of a skill',
	'prestige-1': 'Prestige a skill',
	rebirth: 'Rebirth your character',
	'first-1': 'Take #1 on a ranked map',
	'curator-1': 'Propose a map that gets approved',
	'mapper-1': 'Map a set that gets approved',
	'friends-1': 'Get added as a friend',
	'combo-727': 'Finish a play at exactly 727 combo',
	'same-map-100': 'Play the same map 100 times',
	'fail-99': 'Fail a map with 1% of it left',
	'fail-10s': 'Fail a map in its first 10 seconds',
	'night-owl': 'Play between 3 and 5 am',
	'first-chat': 'Say something in #oss!idle',
	possessed: 'Get a 1,000,000 score on TAG underground - POSSESSION',
	parallax: 'Get an S on The Parallax II: Future Sequence [Marathon]',
	wonderful: 'Get an SS on AiAe [Wafles\' SHD]',
});

/** The medals of a numbered series share one text: the number is the medal
 *  id's (`plays-1k`, `time-10h`). */
const SERIES_DESCRIPTIONS = defineMessages({
	pass: 'Pass a ranked map of {stars}★ or more',
	fc: 'Full combo a ranked map of {stars}★ or more',
	plays: 'Play {count} approved maps',
	hits: 'Hit {count} notes',
	time: 'Play for {hours} hours',
	overall: 'Reach overall level {level}',
	upgrades: 'Hold {count} upgrades at once',
	ladders: 'Max out the upgrades of {count} skills at once',
	overdrive: 'Reach {omega}ω overdrive on a skill',
	prestige: 'Prestige {count} times in total',
	first: 'Hold #1 on {count} ranked maps',
	pp: 'Reach {pp} pp',
	'play-pp': 'Set a {pp} pp play',
	top: 'Be in the top {percent}% of players by pp',
	curator: 'Have {count} of your proposed maps approved',
	mapper: 'Have {count} of your own mapsets approved',
	friends: 'Get added as a friend by {count} players',
});

/** A skill's mastery medals: the tier, with the skill as `medalSkill` gives it. */
const SKILL_TIERS = defineMessages({
	50: '{skill} Adept',
	100: '{skill} Master',
	105: '{skill} Grandmaster',
	110: '{skill} Legend',
});

const MULTIPLIERS: Record<string, number> = {
	'': 1, k: 1e3, m: 1e6, b: 1e9,
};

/** A numbered medal's series and number: `plays-1k` is plays, 1000. */
const series = (id: string): { name: string, n: number } | undefined => {
	const match = /^(.+)-(\d+)([kmb]?)h?$/.exec(id);
	return match ? {
		name: match[1], n: Number(match[2]) * MULTIPLIERS[match[3]],
	} : undefined;
};

/** How a ruleset's skills read in its medals' text. */
export type MedalSkills = {
	/** a skill as it reads inside a medal name; none for a name that isn't a skill */
	inName(skill: string): string | undefined,
	/** a skill's usual name */
	name(skill: string): string,
};

/** The names and descriptions of a catalogue whose ids carry `prefix`. */
export const medalText = (prefix: string, skills: MedalSkills) => {
	const base = (id: string) => id.startsWith(prefix) ? id.slice(prefix.length) : id;
	return {
		name: (id: string): string => {
			const numbered = series(base(id));
			const skill = numbered && skills.inName(numbered.name);
			if (numbered && skill) {
				const template = SKILL_TIERS[numbered.n as keyof typeof SKILL_TIERS];
				return __(template, undefined, { skill });
			}
			return __(NAMES[base(id) as keyof typeof NAMES]);
		},
		description: (id: string): string => {
			const unique = DESCRIPTIONS[base(id) as keyof typeof DESCRIPTIONS];
			if (unique) return __(unique);
			const { name, n } = series(base(id))!;
			if (skills.inName(name)) {
				return __('Reach level {level} in {skill}', undefined, {
					level: n, skill: skills.name(name),
				});
			}
			return __(SERIES_DESCRIPTIONS[name as keyof typeof SERIES_DESCRIPTIONS], undefined, {
				stars: n, count: num(n), hours: num(n), level: n, omega: n, pp: num(n), percent: n,
			});
		},
	};
};
