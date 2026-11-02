import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useState } from 'react';

import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	REBIRTH_UNLOCKS,
	unlocksForGeneration,
} from '@oss-idle/shared/rebirth';
import {
	canRebirth,
	rebirthMinLevel,
} from '@oss-idle/shared/upgrades';

import Entities from '../../entity/entities';
import { listCharacters } from '../../online/services/lineage';
import { rebirth } from '../../online/services/prestige';
import ConfirmMenu, { type Confirm } from '../ConfirmMenu';
import LineageList from './LineageList';

export default function RebirthView() {
	const { t } = useLingui();
	const [character] = useSynced(Entities.character);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState<Confirm | undefined>(undefined);

	const generation = character.generation;
	const owned = unlocksForGeneration(generation);
	const next = REBIRTH_UNLOCKS[owned.length];
	const lineage = useAsync(listCharacters, [character.id]);
	// only the newest generation goes on: the ones behind it stay as they are
	const reborn = lineage?.some(c => c.generation > generation) ?? false;
	const overall = character.overallLifetimeLevel();
	const required = rebirthMinLevel(generation);
	const ready = character.id !== 0 && !reborn && canRebirth(overall, generation) && !!name.trim();

	const run = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await rebirth(name.trim());
		} finally {
			setBusy(false);
		}
	};

	const confirm = () => {
		if (!ready || busy) return;
		const wanted = name.trim();
		const handover = wanted === character.name
			? t`${ph({ name: character.name })} becomes ${ph({ name: character.name })}_old`
			: t`${ph({ name: character.name })} keeps its name`;
		setConfirming({
			title: t`Rebirth as ${wanted}?`,
			sub: t`${handover}, stays playable and ranked · The new character starts from zero and unlocks: ${ph({ unlocks: next ?? t`nothing new` })}`,
			confirmLabel: t`Rebirth`,
			color: '#ff4089',
			onConfirm: () => void run(),
		});
	};

	return (
		<div className="upgrades">
			<p className="upgrades__hint">
				<Trans>
					After reaching overall Lv{required} you can start over
					with a new character one generation up, which permanently unlocks a new
					feature. Everything you have now stays available: the old character
					remains playable, keeps its levels, and stays on the leaderboards. Pick
					a new name, or keep your current one and the old character gets _old
					appended to its name.
				</Trans>
			</p>

			<div className="rebirth__status">
				<span>
					<Trans>Generation {generation}</Trans>
				</span>
				<span>
					<Trans>Overall Lv{ph({ level: overall })} / {ph({ required })}</Trans>
				</span>
				<span>
					{owned.length > 0
						? <Trans>Unlocked: {ph({ unlocks: owned.join(', ') })}</Trans>
						: <Trans>No unlocks yet</Trans>}
				</span>
				{next && (
					<span><Trans>Next rebirth unlocks: {next}</Trans></span>
				)}
			</div>

			<div className="rebirth__form">
				<input
					className="rebirth__name"
					value={name}
					maxLength={32}
					placeholder={t`New character name`}
					onChange={e => setName(e.target.value)}
				/>
				<button
					className="upgrade__buy"
					disabled={!ready || busy}
					onClick={confirm}
				>
					{reborn
						? <Trans>Already reborn with this character</Trans>
						: canRebirth(overall, generation)
							? <Trans>Rebirth</Trans>
							: <Trans>Requires overall Lv{required}</Trans>}
				</button>
			</div>

			<LineageList />

			{confirming && <ConfirmMenu
				{...confirming}
				onClose={() => setConfirming(undefined)}
			/>}
		</div>
	);
}
