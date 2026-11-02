import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import {
	CLIMAXX_SYMBOL,
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
	type UiSound,
	uiSound,
} from '../../audio/uiSounds';
import {
	convertOverdrive,
	learnGene,
	sellGene,
} from '../../online/services/genetics';
import type { Confirm } from '../ConfirmMenu';
import { geneName } from './geneText';

/** Learning, selling and converting, each asked first (Shift skips the question), one at a time. */
export default function useGeneActions(
	def: GeneticsDef | undefined,
	genetics: Genetics,
	levels: PlayLevels,
) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState<Confirm>();
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
		const price = `${CLIMAXX_SYMBOL}${def && skill ? nextTierPrice(def, genetics, skill).toLocaleString() : ''}`;
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

	return {
		busy,
		confirming,
		close: () => setConfirming(undefined),
		learn: (gene: string) => ask(gene, false),
		sell: (gene: string) => ask(gene, true),
		convert: (skill: string) => void run(() => convertOverdrive(skill), 'ui/notification-done'),
	};
}
