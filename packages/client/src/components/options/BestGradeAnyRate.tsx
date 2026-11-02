import { Trans } from '@lingui/react/macro';

import { SETTINGS } from '../../db/settings';
import Checkbox from './controls/Checkbox';

export default function BestGradeAnyRate() {
	return <Checkbox value={SETTINGS.bestGradeAnyRate} label={
		<Trans>Show the best grade at any rate</Trans>
	} />;
}
