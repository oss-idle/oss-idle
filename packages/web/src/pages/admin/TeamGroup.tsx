import {
	type Group,
	GROUP_BADGE,
} from '@oss-idle/shared/groups';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import {
	NOMINATED_RULESETS,
	type RulesetId,
} from '@oss-idle/shared/rulesets/ids';

import type { TeamMember } from '../../api/team';
import GroupBadge from '../../components/character/GroupBadge';
import Link from '../../components/Link';
import ProfilePicture from '../../components/ProfilePicture';

/** One group of the team page and its members. */
export default function TeamGroup({ group, members, busy, onRemove, onNominates }: {
	group: Group;
	members: TeamMember[];
	busy: boolean;
	onRemove: (userId: number) => Promise<void>;
	onNominates: (userId: number, rulesets: RulesetId[]) => Promise<void>;
}) {
	return <section>
		<h3>
			<GroupBadge group={group} /> {GROUP_BADGE[group].name}
			{' '}<span className='team-group__count'>{members.length}</span>
		</h3>
		{group === 'admin' && <p className='admin-medals__meta'>The owner is always an admin.</p>}
		{!members.length && <p className='admin-medals__meta'>Nobody yet.</p>}
		<ul className='team-group__members'>
			{members.map(m => <li key={m.userId} className='team-member'>
				<ProfilePicture avatarUrl={m.avatarUrl} className='team-member__avatar' />
				{m.characterId
					? <Link to='/c/$id' params={{ id: String(m.characterId) }} className='team-member__name'>
						{m.name}
					</Link>
					: <span className='team-member__name'>{m.username}</span>}
				<span className='team-member__meta'>
					{m.username} · since {new Date(m.since).toLocaleDateString()}
				</span>
				{group === 'bn' && <span className='team-member__rulesets'>
					{NOMINATED_RULESETS.map(ruleset => <label key={ruleset}>
						<input
							type='checkbox'
							disabled={busy}
							checked={m.nominates.includes(ruleset)}
							onChange={e => void onNominates(m.userId, e.target.checked
								? [...m.nominates, ruleset]
								: m.nominates.filter(r => r !== ruleset))}
						/>
						{rulesetLabel(ruleset)}
					</label>)}
				</span>}
				<span className='team-member__actions'>
					<button type='button' disabled={busy} onClick={() => void onRemove(m.userId)}>Remove</button>
				</span>
			</li>)}
		</ul>
	</section>;
}
