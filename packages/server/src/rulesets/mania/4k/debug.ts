import { HTTPException } from 'hono/http-exception';
import { BeatmapDecoder } from 'osu-parsers';

import type { DebugSimBody } from '@oss-idle/shared/debug';
import {
	fatigueLevel,
	warmup,
} from '@oss-idle/shared/fatigue';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import {
	SKILL,
	type SkillName,
} from '@oss-idle/shared/rulesets/mania/4k/skills';
import type { SimPlay } from '@oss-idle/shared/rulesets/mania/sim';
import { maxUpgrades } from '@oss-idle/shared/upgrades';

import { getBeatmap } from '../../../beatmaps';
import {
	profileOf,
	type ProfileRow,
	skillOf,
} from '../../../db/schema/character';
import { sim } from '../../../sim';
import { rulesetOfChart } from '../../registry';
import {
	runManiaPlay,
	strainSamples,
} from '../simulate';

const decoder = new BeatmapDecoder();

/** A real play's input with the knobs on the character's own progress: a level set
 *  by hand keeps its xp only where it is the character's, its lifetime only where
 *  the prestige is too; upgrades stop at what the prestige allows. */
const debugPlay = (profile: ProfileRow, knobs: DebugSimBody): SimPlay<SkillName> => ({
	progress: skill => {
		const own = skillOf(profile, skill);
		const level = knobs.levels[skill] ?? own.level;
		const prestige = knobs.prestige?.[skill] ?? own.prestige;
		const kept = own.level === level;
		return {
			level,
			prestige,
			xp: kept ? own.xp : 0,
			lifetimeXp: kept && own.prestige === prestige ? own.lifetimeXp : 0,
			upgrades: Math.min(own.upgrades, maxUpgrades(prestige)),
			overdrive: own.overdrive,
		};
	},
	fatigue: fatigueLevel(knobs.fatigueMinutes),
	warm: warmup(knobs.fatigueMinutes, skillOf(profile, SKILL.stamina).upgrades),
	plays: knobs.timesPlayed,
});

/** The knobs' play of a 4K map, for the character: its chart, sim input and options. */
const debugRun = async (characterId: number, knobs: DebugSimBody) => {
	const row = await getBeatmap(knobs.beatmapId);
	const r = row && rulesetOfChart(row.mode, row.keys);
	if (!r || r.def.id !== 'mania4k') throw new HTTPException(404, { message: 'No 4K map here' });
	const profile = await profileOf(r, characterId);
	return {
		r,
		chart: decoder.decodeFromString(row.chart),
		play: debugPlay(profile, knobs),
		options: {
			rate: knobs.rate, mods: knobs.mods, divine: hasUnlock(profile.generation, 'DIVINE'),
		},
	};
};

/** The strain view: every skill alone over the map, then combined. */
export const debugStrains = async (characterId: number, knobs: DebugSimBody) => {
	const analyze = sim().mania4k.analyze;
	if (!analyze) throw new HTTPException(404, { message: 'This sim has no strain view' });
	const { chart, play, options } = await debugRun(characterId, knobs);
	return analyze(play, chart, options);
};

/** The debug play: the knobs' whole replay, no-fail, and its gauges. */
export const debugReplay = async (characterId: number, knobs: DebugSimBody) => {
	const {
		r, chart, play, options,
	} = await debugRun(characterId, knobs);
	const bot = sim().mania4k.bot(play);
	const { played } = runManiaPlay(chart, bot, {
		...options, noFail: true, 
	}, false);
	return {
		offsets: played.offsets, strains: strainSamples(bot, r.def.gauged, played.endSongTime),
	};
};
