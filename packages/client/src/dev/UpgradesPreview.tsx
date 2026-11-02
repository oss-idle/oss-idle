import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import Page from '../components/page/Page';

/** The character page around an upgrades layout, at a fixed desktop size. */
export default function UpgradesPreview({
	children,
	tab = 'upgrades',
}: {
	children: ReactNode,
	tab?: 'skills' | 'upgrades' | 'prestige' | 'genetics',
}) {
	return (
		<div style={{
			position: 'relative', width: 1280, height: 800, 
		}}>
			<Page
				title={<Trans>Character</Trans>}
				onBack={() => undefined}
				initialTab={tab}
				tabs={[
					{
						id: 'genetics',
						label: <Trans>Genetics</Trans>,
						subtitle: <Trans>What your character was born good at, kept through prestige</Trans>,
						render: () => tab === 'genetics' && children,
					},
					{
						id: 'skills', label: <Trans>Skills</Trans>, render: () => tab === 'skills' && children,
					},
					{
						id: 'upgrades',
						label: <Trans>Upgrades</Trans>,
						subtitle: <Trans>Trade skill levels for XP boosts</Trans>,
						render: () => tab === 'upgrades' && children,
					},
					{
						id: 'prestige', label: <Trans>Prestige</Trans>, render: () => tab === 'prestige' && children,
					},
					{
						id: 'rebirth', label: <Trans>Rebirth</Trans>, render: () => undefined, 
					},
				]}
			/>
		</div>
	);
}
