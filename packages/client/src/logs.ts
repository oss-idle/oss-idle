import {
	ph,
	t,
} from '@lingui/core/macro';

import type { ChatLine } from '@oss-idle/shared/community/wire';
import accuracyText from '@oss-idle/shared/display/accuracy';
import { bignum } from '@oss-idle/shared/display/num';
import type { Grade } from '@oss-idle/shared/grade';
import Synced from '@oss-idle/shared/helpers/synced';
import type { Mod } from '@oss-idle/shared/mods';
import type { SkillGain } from '@oss-idle/shared/play';
import { versionLabel } from '@oss-idle/shared/rate';

import Entities from './entity/entities';
import {
	type LogPart,
	logParts,
	mark,
	unmarked,
} from './logMarks';
import type LightBeatmap from './osu/beatmap/LightBeatmap';
import { selectedDef } from './rulesets/registry';

/** The client-only chat channel: written by code, never touches the wire. */
export const LOGS_CHANNEL = '#logs';

const LOG_COLOR = '#58a0ec';
/** the words around a play's or a level-up's coloured values */
const PLAY_COLOR = '#a9b4c2';
/** Keep at most this many lines, as chat does. */
const LOG_LIMIT = 200;

/** A #logs line, with its coloured pieces when it has marked values. */
export type LogEntry = ChatLine & { parts?: LogPart[] };

export const logLines = new Synced<LogEntry[]>([]);

// local lines only need unique ids; crypto.randomUUID is missing outside
// secure contexts (the LAN staging is plain http)
let lineSeq = 0;

/** A line in #logs. Values put in with {@link mark} are drawn in their kind's colour. */
export const log = (text: string, color = LOG_COLOR, at = Date.now()): void => {
	const parts = logParts(text);
	const line: LogEntry = {
		id: `log-${++lineSeq}`,
		kind: 'system',
		channel: LOGS_CHANNEL,
		text: unmarked(text),
		color,
		at,
		...parts.some(p => p.kind) && { parts },
	};
	void logLines.set([...logLines.get(), line].slice(-LOG_LIMIT));
};

const gainsSummary = (progression?: SkillGain[]): string => {
	const gains = (progression ?? [])
		.filter(g => g.gained > 0)
		.sort((a, b) => b.gained - a.gained)
		.map(g => `+${mark('xp', bignum(g.gained), g.gained)} ${mark('skill', selectedDef().skillName(g.skill))}`
			+ (g.toLevel > g.fromLevel ? ` (${mark('level', `lv${g.fromLevel} to lv${g.toLevel}`)})` : ''));
	return gains.length ? gains.join(', ') : t`No XP gained.`;
};

/** One #logs line per finished play: who, what map at what rate and mods, result, pp,
 *  XP breakdown. */
export const logPlayFinished = (
	score: {
		accuracy: number, grade: Grade, playedAt: number, rate: number, mods: readonly Mod[], pp: number,
	},
	beatmap: LightBeatmap,
	progression?: SkillGain[],
): void => {
	const name = mark('player', Entities.character.get()?.name ?? t`Guest`);
	const meta = beatmap.set.metadata;
	const rated = versionLabel('', score.rate, score.mods);
	const map = mark('map', `${meta.artist} - ${meta.title} [${beatmap.metadata.version}`)
		+ (rated ? ` ${mark('mods', rated)}` : '') + mark('map', ']');
	const accuracy = mark('acc', accuracyText(score.accuracy));
	const grade = mark('grade', score.grade);
	const pp = score.pp > 0 ? ` (${mark('pp', `${Math.round(score.pp)}pp`)})` : '';
	const gains = gainsSummary(progression);
	log(
		t`${name} played ${map} and got a ${accuracy} ${grade}${pp}. ${gains}`,
		PLAY_COLOR,
		score.playedAt,
	);
	logSkillLevelUps(progression, score.playedAt);
};

/** One #logs line per level crossed this play, every level, every time. */
const logSkillLevelUps = (progression?: SkillGain[], at = Date.now()): void => {
	for (const g of progression ?? []) {
		const skill = selectedDef().skillName(g.skill);
		for (let level = g.fromLevel + 1; level <= g.toLevel; level++) {
			log(
				t`${ph({ skill: mark('skill', skill) })} reached level ${ph({ level: mark('level', String(level)) })}!`,
				PLAY_COLOR,
				at,
			);
		}
	}
};
