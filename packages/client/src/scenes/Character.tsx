import '../components/upgrades/upgrades.css';
import '../components/character/character.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import PrestigeView from '../components/character/PrestigeView';
import RebirthView from '../components/character/RebirthView';
import GeneticsView from '../components/genetics/GeneticsView';
import Page from '../components/page/Page';
import SkillsView from '../components/skills/SkillsView';
import UpgradesView from '../components/upgrades/UpgradesView';
import Entities from '../entity/entities';
import { openPage } from '../globals';
import {
	rulesetDef,
	selectedRuleset,
} from '../rulesets/registry';

/** The character page: the skills, then the three progression loops, one per tab. */
export default function Character({ tab = 'upgrades' }: { tab?: string }) {
	const { t } = useLingui();
	const [character] = useSynced(Entities.character);
	const [ruleset] = useSynced(selectedRuleset);

	return (
		<Page
			title={<Trans>Character</Trans>}
			onBack={() => openPage.set(undefined)}
			initialTab={tab}
			tabs={[
				...rulesetDef(ruleset).genetics ? [{
					id: 'genetics',
					label: <Trans>Genetics</Trans>,
					subtitle: t`What your character was born good at, kept through prestige`,
					render: () => <GeneticsView character={character} />,
				}] : [],
				{
					id: 'skills',
					label: <Trans>Skills</Trans>,
					subtitle: t`What each skill does and what multiplies its XP`,
					render: () => <SkillsView character={character} />,
				},
				{
					id: 'upgrades',
					label: <Trans>Upgrades</Trans>,
					subtitle: t`Trade skill levels for XP boosts`,
					render: () => <UpgradesView character={character} />,
				},
				{
					id: 'prestige',
					label: <Trans>Prestige</Trans>,
					subtitle: t`Reset a skill for a permanent level bonus`,
					render: () => <PrestigeView character={character} />,
				},
				...rulesetDef(ruleset).rebirth ? [{
					id: 'rebirth',
					label: <Trans>Rebirth</Trans>,
					subtitle: t`Start over with a new character that unlocks new features`,
					render: () => <RebirthView />,
				}] : [],
			]}
		/>
	);
}
