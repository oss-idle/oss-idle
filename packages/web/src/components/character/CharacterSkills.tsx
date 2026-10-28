import { Trans } from '@lingui/react/macro';

import { xpGivesLevel } from '@oss-idle/shared/xp';

import type { getCharacter } from '../../api/characters';
import { SkillBar } from './SkillBar';

/** The profile's Skills block: overall level, then each skill. */
export default function CharacterSkills({ character }: {
	character: Awaited<ReturnType<typeof getCharacter>>;
}) {
	return <div className='character__block character__block-skills'>
		<div className='character__block-title'><Trans>Skills</Trans></div>
		<div className='main-skill'><SkillBar ruleset={character.ruleset} skill={'overall'} progress={{
			...xpGivesLevel(character.profile.overallLifetimeXp),
			lifetimeXp: character.profile.overallLifetimeXp,
		}} /></div>
		<ul className='skills'>
			{Object.entries(character.profile.skills)
				.map(([skill, progress]) => <SkillBar
					key={skill}
					ruleset={character.ruleset}
					skill={skill}
					progress={progress}
				/>)}
		</ul>
	</div>;
}
