import { useState } from 'react';

import { prestigeSkill } from '../../online/services/prestige';
import type { ClimaxxTransfer } from './PrestigeClimaxxPop';

/** Running a skill's prestige, and the climaxx transfer to show once it landed. */
export default function usePrestige(
	skill: string, overdrive: number, gain: number, climaxxNow?: () => number,
) {
	const [busy, setBusy] = useState(false);
	const [transfer, setTransfer] = useState<ClimaxxTransfer>();

	const run = async (force = false) => {
		if (busy) return;
		setBusy(true);
		const before = climaxxNow?.() ?? 0;
		try {
			const landed = await prestigeSkill(skill, force);
			if (landed && !force && gain > 0) setTransfer({
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
