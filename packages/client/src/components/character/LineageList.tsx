import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { unlocksForGeneration } from '@oss-idle/shared/rebirth';

import type Character from '../../db/schema/character';
import Entities from '../../entity/entities';
import {
	listCharacters,
	selectCharacter,
} from '../../online/services/lineage';

/** The hall of fame: every character the player has been, and a way back to any
 *  of them. Retired ones keep their levels and their leaderboard places. */
export default function LineageList() {
	const [live] = useSynced(Entities.character);
	const [lineage, setLineage] = useState<Character[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let stale = false;
		void listCharacters().then(list => {
			if (!stale) setLineage(list);
		});
		return () => {
			stale = true;
		};
	}, [live.id]);

	const switchTo = async (id: number) => {
		if (busy) return;
		setBusy(true);
		try {
			await selectCharacter(id);
		} finally {
			setBusy(false);
		}
	};

	if (lineage.length <= 1) return null;

	return (
		<div className="lineage">
			<h3 className="lineage__title"><Trans>Hall of fame</Trans></h3>
			<div className="lineage__list">
				{lineage.map(character => {
					const unlocks = unlocksForGeneration(character.generation);
					const current = character.id === live.id;
					return (
						<div
							key={character.id}
							className={`lineage__row ${current ? 'is-current' : ''}`}
						>
							<span className="lineage__name">{character.name}</span>
							<span className="lineage__gen">
								<Trans>Gen {ph({ generation: character.generation })}</Trans>
							</span>
							<span className="lineage__overall">
								<Trans>Overall Lv{ph({ level: character.overallLifetimeLevel() })}</Trans>
							</span>
							<span className="lineage__unlocks">
								{unlocks.length > 0 ? unlocks.join(', ') : <Trans>No unlocks</Trans>}
							</span>
							<button
								className="upgrade__buy"
								disabled={current || busy}
								onClick={() => void switchTo(character.id)}
							>
								{current ? <Trans>Playing</Trans> : <Trans>Play</Trans>}
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
