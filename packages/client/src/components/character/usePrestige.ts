import { useState } from 'react';

import {
	type Big,
	ZERO,
} from '@oss-idle/shared/big';

import { prestigeSkill } from '../../online/services/prestige';
import type { ClimaxxTransfer } from './PrestigeClimaxxPop';

/** Running a skill's prestige, and the climaxx transfer to show once it landed. */
export default function usePrestige(
	skill: string, overdrive: Big, gain: Big, climaxxNow?: () => Big,
) {
	const [busy, setBusy] = useState(false);
	const [transfer, setTransfer] = useState<ClimaxxTransfer>();

	const run = async (force = false) => {
		if (busy) return;
		setBusy(true);
		const before = climaxxNow?.() ?? ZERO;
		try {
			const landed = await prestigeSkill(skill, force);
			if (landed && !force && gain.gt(0)) setTransfer({
				skill, overdrive, before, gain,
			});
		} finally {
			setBusy(false);
		}
	};

	return {
		busy, run, transfer, closeTransfer: () => setTransfer(undefined),
	};
}
