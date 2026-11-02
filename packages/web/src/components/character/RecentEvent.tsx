import { ph } from '@lingui/core/macro';
import {
	Plural,
	Trans,
} from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { medalLook } from '@oss-idle/shared/achievements/catalogue';
import { dateAgo } from '@oss-idle/shared/display/ago';
import type { EventData } from '@oss-idle/shared/events';
import {
	MODE_NAMES,
	variantName,
} from '@oss-idle/shared/rulesets/display';
import {
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import type { ProfileEvent } from '../../api/characters';
import {
	anyMedal,
	medalName,
} from '../../rulesets';
import Link from '../Link';
import Grade from '../score/Grade';
import MedalIcon from './MedalIcon';

/** osu!'s "(osu!mania)" after a play: the ruleset's mode and variant. */
const modeName = (id: RulesetId) =>
	[MODE_NAMES[RULESETS[id].mode], variantName(id)].filter(Boolean).join(' ');

/** What befell a map: the account's plays on it, or the account's own maps. */
const mapText = (
	event: EventData, user: ReactNode, map: ReactNode, set: ReactNode, mode = '',
) => {
	switch (event.type) {
		case 'rank':
			return <Trans>{user} achieved rank #{ph({ rank: event.rank })} on {map} ({ph({ mode })})</Trans>;
		case 'rankLost':
			return <Trans>{user} has lost first place on {map} ({ph({ mode })})</Trans>;
		case 'beatmapsetUpload':
			return <Trans>{user} has submitted a new beatmap "{set}"</Trans>;
		case 'beatmapsetUpdate':
			return <Trans>{user} has updated the beatmap "{set}"</Trans>;
		case 'beatmapsetApprove':
			return event.status === 'loved'
				? <Trans>{set} by {user} has been loved!</Trans>
				: <Trans>{set} by {user} has been ranked!</Trans>;
		case 'beatmapPlaycount':
			return <Trans>
				{map} has been played <Plural value={ph({ count: event.count })} one='# time' other='# times' />!
			</Trans>;
		default:
			return undefined;
	}
};

/** What befell the account itself. */
const accountText = (event: EventData, user: ReactNode) => {
	switch (event.type) {
		case 'achievement':
			return <Trans>{user} unlocked the "{ph({ medal: medalName(event.medalId) })}" medal!</Trans>;
		case 'userSupportFirst':
			return <Trans>{user} has become an oss!supporter - thanks for your generosity!</Trans>;
		case 'userSupportAgain':
			return <Trans>
				{user} has once again chosen to support oss!idle - thanks for your generosity!
			</Trans>;
		case 'userSupportGift':
			return <Trans>{user} has received the gift of oss!supporter!</Trans>;
		case 'usernameChange':
			return <Trans>
				<strong>{ph({ previous: event.previousUsername })}</strong> has changed their username
				to <strong>{ph({ username: event.username })}</strong>!
			</Trans>;
		default:
			return undefined;
	}
};

/** One line of osu!web's recent activity: its badge, what happened, when. */
export default function RecentEvent({ entry, name }: { entry: ProfileEvent, name: string }) {
	const { event, beatmap, beatmapset, ruleset } = entry;
	const user = <strong>{name}</strong>;
	const mode = ruleset && modeName(ruleset);
	const map = beatmap && <Link
		to='/maps/$id'
		params={{ id: String(beatmap.setId) }}
		search={{
			ruleset, diff: beatmap.id,
		}}
		className='profile-events__link'
	>{beatmap.artist} - {beatmap.title} [{beatmap.version}]</Link>;
	const set = beatmapset && <Link
		to='/maps/$id'
		params={{ id: String(beatmapset.id) }}
		search={{ ruleset }}
		className='profile-events__link'
	>{beatmapset.artist} - {beatmapset.title}</Link>;
	const medal = event.type === 'achievement' ? anyMedal(event.medalId) : undefined;

	return <li className='profile-events__item'>
		<span className='profile-events__badge'>
			{event.type === 'rank' && <Grade grade={event.grade} />}
			{medal && <MedalIcon look={medalLook(medal)} />}
		</span>
		<span className='profile-events__text'>
			{mapText(event, user, map, set, mode) ?? accountText(event, user)}
		</span>
		<span className='profile-events__date'>{dateAgo(entry.createdAt)}</span>
	</li>;
}
