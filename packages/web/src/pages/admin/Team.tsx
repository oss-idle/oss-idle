import './Medals.css';
import './Team.css';

import {
	useCallback,
	useEffect,
	useState,
} from 'react';

import {
	GROUP_BADGE,
	GROUPS,
} from '@oss-idle/shared/groups';
import { useAction } from '@oss-idle/shared/hooks/useAction';

import {
	addToGroup,
	getTeam,
	removeFromGroup,
	setNominates,
} from '../../api/team';
import TeamGroup from './TeamGroup';
import TeamSearch from './TeamSearch';

/** The team: find a player to add to a group, and each group's members. */
export default function Team() {
	const [team, setTeam] = useState<Awaited<ReturnType<typeof getTeam>>>();
	const {
		busy, error, setError, run: runAction,
	} = useAction();

	const refresh = useCallback(() => getTeam()
		.then(setTeam)
		.catch(e => setError(String((e as Error).message ?? e))), []);

	useEffect(() => { void refresh(); }, [refresh]);

	const run = (action: () => Promise<unknown>) => runAction(action, refresh);

	return <main className='admin-medals'>
		<p className='admin-medals__meta'>
			Admins ({GROUP_BADGE.admin.short}) manage the team and every admin page. The Global
			Moderation Team ({GROUP_BADGE.gmt.short}) silences, restricts and handles reports from the
			chat console, the restricted accounts page and a profile's ⋮ menu. Beatmap Nominators
			({GROUP_BADGE.bn.short}) review requests and rank maps in the rulesets ticked beside their
			name. All show their badge on their profile and their colour in chat; admins can't be
			sanctioned.
		</p>
		{error && <p>{error}</p>}
		{!team && <p>Loading…</p>}
		<TeamSearch busy={busy} onAdd={(group, userId) => run(() => addToGroup(group, userId))} />
		{team && GROUPS.map(group => <TeamGroup
			key={group}
			group={group}
			members={team.members.filter(m => m.group === group)}
			busy={busy}
			onRemove={userId => run(() => removeFromGroup(group, userId))}
			onNominates={(userId, rulesets) => run(() => setNominates(userId, rulesets))}
		/>)}
	</main>;
}
