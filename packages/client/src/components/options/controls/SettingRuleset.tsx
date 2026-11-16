import type Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { RulesetSetting } from '../../../db/settings';
import { selectedRuleset } from '../../../rulesets/registry';
import RulesetTag from '../../community/chat/RulesetTag';

/** The ruleset a per-ruleset setting is showing; nothing for a shared one. */
export default function SettingRuleset<T>({ value }: { value: Synced<T> }) {
	const [ruleset] = useSynced(selectedRuleset);
	if (!(value instanceof RulesetSetting)) return undefined;
	return <RulesetTag ruleset={ruleset} />;
}
