import { Trans } from '@lingui/react/macro';

import {
	changeableAt,
	type Genetics,
} from '@oss-idle/shared/genetics';

import { geneticChoice } from '../../globals';
import { PBE } from '../../pbe/pbe';
import PageBarActions from '../page/PageBarActions';
import GeneticsChangeLabel from './GeneticsChangeLabel';

/** A word for local characters, and the ring to change genetics on: with several, which one is
 *  clicked there. */
type Props = { genetics: Genetics, slots: number, local: boolean };

const hoursUntil = (at: number) => Math.ceil((at - Date.now()) / 3600_000);

export default function GeneticsFooter({ genetics, slots, local }: Props) {
	const free = genetics.picks.length < slots;
	const hours = PBE ? 0 : hoursUntil(Math.min(...genetics.picks.map(changeableAt)));
	return (
		<>
			{local && (
				<div className="genetics__keys">
					<Trans>A local character only gets the XP and overdrive genes.</Trans>
				</div>
			)}
			<PageBarActions
				actions={[
					{
						id: 'genetics-change',
						label: <GeneticsChangeLabel several={slots > 1} hours={hours} free={free} />,
						disabled: !free && hours > 0,
						onClick: () => void geneticChoice.set('change'),
					},
				]}
			/>
		</>
	);
}
