import { useState } from 'react';

import SkillState from '@oss-idle/shared/rulesets/skillState';

import { prestigeSkill } from '../../online/services/prestige';
import type { ClimaxxTransfer } from './PrestigeClimaxxPop';

/** Running a skill's prestige, and the climaxx transfer to show once it landed. */
export default function usePrestige(skill: SkillState, gain: number, climaxxNow?: () => number) {
	const [busy, setBusy] = useState(false);
	const [transfer, setTransfer] = useState<ClimaxxTransfer>();

	const run = async () => {
		if (busy) return;
		setBusy(true);
		const overdrive = skill.overdrive.get();
		const before = climaxxNow?.() ?? 0;
		try {
			const landed = await prestigeSkill(skill.name);
			if (landed && gain > 0) setTransfer({
				skill: skill.name, overdrive, before, gain,
			});
		} finally {
			setBusy(false);
		}
	};

	return {
		busy, run, transfer, closeTransfer: () => setTransfer(undefined),
	};
}
