import './RulesetSwitch.css';

import { faStar } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Trans } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';

import { rulesetLabel } from '@oss-idle/shared/rulesets/display';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { setMyRuleset } from '../../api/characters';
import {
	refreshCurrentCharacter,
	useCurrentCharacter,
} from '../../hooks/useCurrentCharacter';
import {
	ENABLED_RULESETS,
	RULESET_TABS,
} from '../../rulesets';
import Link from '../Link';


/** osu!'s profile mode switch: the profile in each ruleset, a star on the one played. */
export default function RulesetSwitch({ id, characterId, shown, picked }: {
	id: string,
	characterId: number,
	shown: RulesetId,
	picked: RulesetId,
}) {
	const mine = useCurrentCharacter();
	const navigate = useNavigate();
	if (ENABLED_RULESETS.length < 2) return undefined;
	const settable = mine?.id === characterId && !mine.rulesetLock;

	const setMain = async (ruleset: RulesetId) => {
		await setMyRuleset(ruleset);
		refreshCurrentCharacter();
		void navigate({
			to: '/c/$id', params: { id }, 
		});
	};

	return (
		<nav className='ruleset-switch'>
			{RULESET_TABS.map(ruleset => (
				<span
					key={ruleset}
					className={`ruleset-switch__item${ruleset === shown ? ' ruleset-switch__item--active' : ''}`}
				>
					{ruleset === picked && <FontAwesomeIcon icon={faStar} className='ruleset-switch__star' />}
					{settable && ruleset === shown && ruleset !== picked && <button
						type='button'
						className='ruleset-switch__set-main'
						onClick={() => void setMain(ruleset)}
					>
						<FontAwesomeIcon icon={faStar} className='ruleset-switch__star' />
						<span className='ruleset-switch__tooltip'><Trans>Set as main mode</Trans></span>
					</button>}
					<Link
						to='/c/$id'
						params={{ id }}
						search={{ ruleset: ruleset === picked ? undefined : ruleset }}
						className='ruleset-switch__link'
					>
						{rulesetLabel(ruleset)}
					</Link>
				</span>
			))}
		</nav>
	);
}
