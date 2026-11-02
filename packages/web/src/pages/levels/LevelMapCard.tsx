import {
	faGavel,
	faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import type { LevelMap } from '../../api/levelVotes';
import { coverBackground } from '../../api/maps';
import Link from '../../components/Link';
import LevelMapTarget from './LevelMapTarget';
import LevelVoteModeration from './LevelVoteModeration';
import type { VoteSkill } from './skill';
import SkillVote from './SkillVote';

export default function LevelMapCard({
	map, skills, canVote, admin, moderator, onVote, onToggleSkill, onTarget, onRemove, onModerated,
}: {
	map: LevelMap,
	skills: VoteSkill[],
	canVote: boolean,
	admin: boolean,
	moderator: boolean,
	onVote: (beatmapId: number, skill: string, level: number | undefined) => void,
	onToggleSkill: (skill: string) => void,
	onTarget: (target: string) => void,
	onRemove: () => void,
	onModerated: () => Promise<void> | void,
}) {
	const { t } = useLingui();
	const [moderating, setModerating] = useState(false);
	const shown = admin ? skills : skills.filter(s => !map.disabled.includes(s.key));

	return (<div className='level-map'>
		<div className='level-map__head'>
			<span
				className='level-map__cover'
				style={{
					backgroundImage: coverBackground({
						id: map.setId, osuId: map.osuId, osuCover: map.osuCover, background: map.background,
					}, 'list'),
				}}
			/>
			<Link
				to='/maps/$id'
				params={{ id: String(map.setId) }}
				search={{ diff: map.beatmapId }}
				className='level-map__meta'
			>
				<span className='level-map__title'>{map.title}</span>
				<span className='level-map__artist'>{map.artist}</span>
				<span className='level-map__version'>
					<span className='level-map__stars'>★ {map.sr.toFixed(2)}</span> {map.version}
				</span>
			</Link>
			<LevelMapTarget target={map.target} admin={admin} onChange={onTarget} />
			{moderator && <button
				className={`level-map__remove ${moderating ? 'is-active' : ''}`}
				aria-label={t`Moderate the votes`}
				onClick={() => setModerating(on => !on)}
			>
				<FontAwesomeIcon icon={faGavel} />
			</button>}
			{admin && <button className='level-map__remove' aria-label={t`Remove this map`} onClick={onRemove}>
				<FontAwesomeIcon icon={faTrash} />
			</button>}
		</div>
		{moderating && <LevelVoteModeration
			beatmapId={map.beatmapId}
			skills={skills}
			onChanged={onModerated}
		/>}
		<div className='level-map__skills'>
			{shown.map(s => <SkillVote
				key={s.key}
				skill={s}
				levels={map.levels[s.key] ?? []}
				mine={map.mine[s.key]}
				canVote={canVote}
				disabled={map.disabled.includes(s.key)}
				admin={admin}
				onVote={level => onVote(map.beatmapId, s.key, level)}
				onToggle={() => onToggleSkill(s.key)}
			/>)}
		</div>
	</div>);
}
