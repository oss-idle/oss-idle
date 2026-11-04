import {
	ph,
	t,
} from '@lingui/core/macro';

import type { ChatLine } from '@oss-idle/shared/community/wire';
import accuracyText from '@oss-idle/shared/display/accuracy';
import { bignum } from '@oss-idle/shared/display/num';
import type { Grade } from '@oss-idle/shared/grade';
import Synced from '@oss-idle/shared/helpers/synced';
import type { SkillGain } from '@oss-idle/shared/play';

import Entities from './entity/entities';
import type LightBeatmap from './osu/beatmap/LightBeatmap';
import { selectedDef } from './rulesets/registry';

/** The client-only chat channel: written by code, never touches the wire. */
export const LOGS_CHANNEL = '#logs';

const LOG_COLOR = '#58a0ec';
const LEVELUP_COLOR = '#81fa9b';
/** Keep at most this many lines, as chat does. */
const LOG_LIMIT = 200;

export const logLines = new Synced<ChatLine[]>([]);

// local lines only need unique ids; crypto.randomUUID is missing outside
// secure contexts (the LAN staging is plain http)
let lineSeq = 0;

export const log = (text: string, color = LOG_COLOR, at = Date.now()): void => {
	const line: ChatLine = {
		id: `log-${++lineSeq}`,
		kind: 'system',
		channel: LOGS_CHANNEL,
		text,
		color,
		at,
	};
	void logLines.set([...logLines.get(), line].slice(-LOG_LIMIT));
};

const gainsSummary = (progression?: SkillGain[]): string => {
	const gains = (progression ?? [])
		.filter(g => g.gained > 0)
		.sort((a, b) => b.gained - a.gained)
		.map(g => `+${bignum(g.gained)} ${selectedDef().skillName(g.skill)}`
			+ (g.toLevel > g.fromLevel ? ` (lv${g.fromLevel} to lv${g.toLevel})` : ''));
	return gains.length ? gains.join(', ') : t`No XP gained.`;
};

/** One #logs line per finished play: who, what map, result, XP breakdown. */
export const logPlayFinished = (
	score: { accuracy: number; grade: Grade; playedAt: number },
	beatmap: LightBeatmap,
	progression?: SkillGain[],
): void => {
	const name = Entities.character.get()?.name ?? t`Guest`;
	const meta = beatmap.set.metadata;
	const map = `${meta.artist} - ${meta.title} [${beatmap.metadata.version}]`;
	const accuracy = accuracyText(score.accuracy);
	const grade = score.grade;
	const gains = gainsSummary(progression);
	log(
		t`${name} played ${map} and got a ${accuracy} ${grade}. ${gains}`,
		LOG_COLOR,
		score.playedAt,
	);
	logSkillLevelUps(progression, score.playedAt);
};

/** One #logs line per level crossed this play, every level, every time. */
const logSkillLevelUps = (progression?: SkillGain[], at = Date.now()): void => {
	for (const g of progression ?? []) {
		const skill = selectedDef().skillName(g.skill);
		for (let level = g.fromLevel + 1; level <= g.toLevel; level++) {
			log(t`${ph({ skill })} reached level ${level}!`, LEVELUP_COLOR, at);
		}
	}
};
