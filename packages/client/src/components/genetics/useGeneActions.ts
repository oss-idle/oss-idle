import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { bignum } from '@oss-idle/shared/display/num';
import {
	CLIMAXX_SYMBOL,
	conversionGain,
	geneOf,
	type Genetics,
	type GeneticsDef,
	learnRefusal,
	nextTierPrice,
	type PlayLevels,
	SELL_FEE,
	sellRefusal,
	tierOf,
} from '@oss-idle/shared/genetics';
import useShiftHeld from '@oss-idle/shared/hooks/useShiftHeld';
import {
	OVERDRIVE_SYMBOL,
	upgradeXPMultiplier,
} from '@oss-idle/shared/upgrades';

import {
	type UiSound,
	uiSound,
} from '../../audio/uiSounds';
import {
	convertOverdrive,
	learnGene,
	sellGene,
} from '../../online/services/genetics';
import { selectedDef } from '../../rulesets/registry';
import type { ClimaxxTransfer } from '../character/PrestigeClimaxxPop';
import type { Confirm } from '../ConfirmMenu';
import { geneName } from './geneText';

type Converting = {
	overdrive: number,
	/** overdrive the next tier needs; none when there is nothing to convert */
	need?: number,
	/** the skill's climaxx before */
	climaxx: number,
	upgrades: number,
};

/** Learning, selling and converting, each asked first (Shift skips the question), one at a time. */
export default function useGeneActions(
	def: GeneticsDef | undefined,
	genetics: Genetics,
	levels: PlayLevels,
) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState<Confirm>();
	const [transfer, setTransfer] = useState<ClimaxxTransfer>();
	const instant = useShiftHeld();

	const run = async (action: () => Promise<boolean>, sound: UiSound) => {
		if (busy) return;
		setBusy(true);
		uiSound(sound);
		try {
			if (!await action()) uiSound('ui/default-select-disabled');
		} finally {
			setBusy(false);
		}
	};

	const question = (gene: string, selling: boolean, go: () => void): Confirm => {
		const name = geneName(gene), skill = def && geneOf(def, gene)?.skill;
		const tier = tierOf(genetics, gene) + 1;
		const price = `${CLIMAXX_SYMBOL}${def && skill ? bignum(nextTierPrice(def, genetics, skill)) : ''}`;
		const fee = `${CLIMAXX_SYMBOL}${SELL_FEE}`;
		if (selling) {
			return {
				title: t`Sell ${name}?`,
				sub: t`Its tiers come back as climaxx, less a ${fee} fee`,
				confirmLabel: t`Sell`,
				color: '#6b6b6b',
				onConfirm: go,
			};
		}
		return {
			title: tier > 1 ? t`Upgrade ${name} to tier ${tier}?` : t`Learn ${name}?`,
			sub: t`Costs ${price} climaxx`,
			confirmLabel: tier > 1 ? t`Upgrade` : t`Learn`,
			color: '#ff4089',
			onConfirm: go,
		};
	};

	const ask = (gene: string, selling: boolean) => {
		if (!def) return;
		const refused = (selling ? sellRefusal : learnRefusal)(def, genetics, gene, levels);
		if (refused || busy) {
			uiSound('ui/default-select-disabled');
			return;
		}
		const sound = selling ? 'ui/check-off' : 'ui/notification-done';
		const go = () => void run(() => (selling ? sellGene : learnGene)(gene), sound);
		if (instant) return go();
		uiSound('ui/default-select');
		setConfirming(question(gene, selling, go));
	};

	const convert = (skill: string, { overdrive, need, climaxx, upgrades }: Converting) => {
		if (busy || need === undefined || overdrive < need) return uiSound('ui/default-select-disabled');
		const earned = conversionGain(genetics.converted[skill] ?? 0, need);
		const go = () => void run(async () => {
			const landed = await convertOverdrive(skill);
			if (landed) setTransfer({
				skill, overdrive: need, kept: overdrive - need, before: climaxx, gain: earned,
			});
			return landed;
		}, 'ui/notification-done');
		if (instant) return go();
		uiSound('ui/default-select');
		const od = `${OVERDRIVE_SYMBOL}${need.toFixed(1)}`;
		const gain = `${CLIMAXX_SYMBOL}${earned}`;
		const name = selectedDef().skillName(skill);
		const before = upgradeXPMultiplier(upgrades, overdrive).toFixed(2);
		const after = upgradeXPMultiplier(upgrades, overdrive - need).toFixed(2);
		setConfirming({
			title: t`Turn ${od} overdrive into ${gain} climaxx?`,
			sub: t`${name} XP boost from upgrades drops from x${before} to x${after}`,
			confirmLabel: t`Convert`,
			color: '#ff4089',
			onConfirm: go,
		});
	};

	return {
		busy,
		confirming,
		close: () => setConfirming(undefined),
		transfer,
		closeTransfer: () => setTransfer(undefined),
		learn: (gene: string) => ask(gene, false),
		sell: (gene: string) => ask(gene, true),
		convert,
	};
}
