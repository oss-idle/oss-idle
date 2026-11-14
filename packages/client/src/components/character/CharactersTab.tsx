import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import Entities from '../../entity/entities';
import { roster } from '../../online/services/lineage';
import { selectedRuleset } from '../../rulesets/registry';
import CharactersTable from './CharactersTable';

export default function CharactersTab() {
	const [character] = useSynced(Entities.character);
	const [ruleset] = useSynced(selectedRuleset);
	const characters = useAsync(roster, [character.id, ruleset]);
	return <CharactersTable characters={characters ?? []} shown={{
		id: character.id, ruleset, 
	}} />;
}
