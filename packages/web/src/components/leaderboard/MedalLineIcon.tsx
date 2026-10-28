import { medalLook } from '@oss-idle/shared/achievements/catalogue';
import HoverCard from '@oss-idle/shared/display/HoverCard';

import { anyMedal } from '../../rulesets';
import MedalIcon from '../character/MedalIcon';
import MedalTip from '../character/MedalTip';

/** A medal of a progression line, small, dimmed until reached. */
export default function MedalLineIcon({ id, lit = true }: { id: string, lit?: boolean }) {
	const medal = anyMedal(id);
	if (!medal) return null;
	const icon = <MedalIcon look={medalLook(medal)} />;
	return <HoverCard
		bare
		className={`medal-line__icon ${lit ? '' : 'is-locked'}`}
		card={<MedalTip medal={medal} icon={icon} floating />}>
		{icon}
	</HoverCard>;
}
