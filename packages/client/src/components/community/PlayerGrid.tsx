import './PlayerGrid.css';

import { useLingui } from '@lingui/react/macro';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';

import PlayerCard from './PlayerCard';
import { menuFor } from './state';

const openMenu = (c: PresenceEntry) => void menuFor.set(c);

/** The scrollable grid of online-character cards. */
export default function PlayerGrid({ characters }: { characters: PresenceEntry[] }) {
	const { t } = useLingui();

	if (!characters.length) {
		return <div className="community-empty">{t`No one online`}</div>;
	}

	return (
		<div className="community-grid">
			{characters.map(c => <PlayerCard
				key={c.characterId}
				character={c}
				onClick={openMenu}
			/>)}
		</div>
	);
}
