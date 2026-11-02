import '../upgrades/ladder.css';
import './skills.css';

import { Trans } from '@lingui/react/macro';

import { medalXPMultiplier } from '@oss-idle/shared/achievements/catalogue';
import { geneticsXpParts } from '@oss-idle/shared/genetics';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { useSyncedAll } from '@oss-idle/shared/hooks/useSyncedAll';

import type Character from '../../db/schema/character';
import { getCharacterMedals } from '../../online/services/characters';
import { selectedDef } from '../../rulesets/registry';
import SkillRow from './SkillRow';
import {
	type MedalBoost,
	skillStats,
} from './skillStats';

const medalBoost = async (id: number): Promise<MedalBoost> => {
	const ids = (await getCharacterMedals(id)).held.map(m => m.id);
	return {
		held: ids.length, multiplier: medalXPMultiplier(selectedDef().medals, ids), 
	};
};

export default function SkillsView({ character }: { character: Character }) {
	const online = character.id !== 0 && !character.isGuest();
	const medals = useAsync(() => online ? medalBoost(character.id) : undefined, [character.id]);
	const genetics = selectedDef().genetics;
	const [held] = useSynced(character.genetics);

	useSyncedAll(
		() => character.skills.flatMap(s => [s.level, s.xp, s.upgrades, s.overdrive, s.prestige]),
		[character],
	);

	const stats = character.skills.map(skill => skillStats(
		skill,
		medals,
		genetics && geneticsXpParts(genetics, held, skill.name),
	));
	// every bar is drawn against the biggest total; all at x1 draws nothing
	const scale = Math.log(Math.max(...stats.map(s => s.total))) || 1;

	return (
		<div className="ladder">
			<span className="skill-legend">
				<i className="is-upgrades" /><Trans>upgrades</Trans>
				<i className="is-prestige" /><Trans>prestige</Trans>
				{genetics && <><i className="is-genetics" /><Trans>genetics</Trans></>}
				{medals && <><i className="is-medals" /><Trans>medals</Trans></>}
			</span>
			<div className="ladder__list skill-list">
				{stats.map(s => (
					<SkillRow
						key={`${character.id}:${s.skill.name}`}
						s={s}
						scale={scale}
						lifetimeXp={character.lifetimeXp(s.skill.name)}
					/>
				))}
			</div>
			<p className="ladder__hint">{selectedDef().skillsNote()}</p>
		</div>
	);
}
