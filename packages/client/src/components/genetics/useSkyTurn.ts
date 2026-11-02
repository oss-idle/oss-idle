import {
	useEffect,
	useState,
} from 'react';

import type { GeneticsDef } from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** How far the wheel has turned from the genetic (never wrapped, so every turn animates the short
 *  way), the skill it shows, and which gene is open on it. */
export default function useSkyTurn(def: GeneticsDef | undefined, genetic: string | undefined) {
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<string>();
	const ring = def?.ring ?? [];
	const n = ring.length;

	useEffect(() => {
		setOffset(0);
		setSelected(undefined);
	}, [genetic]);

	const base = genetic ? ring.indexOf(genetic) : -1;
	const turnBy = (by: number) => {
		if (!by) return;
		uiSound('ui/item-swap');
		setOffset(o => o + by);
		setSelected(undefined);
	};
	return {
		offset,
		shown: base < 0 ? undefined : ring[mod(base + offset, n)],
		/** the skill `k` places round from the one shown */
		at: (k: number) => ring[mod(base + offset + k, n)],
		selected,
		select: setSelected,
		turnBy,
		/** to any skill, the short way round */
		turnTo: (skill: string) => {
			const ahead = mod(ring.indexOf(skill) - (base + offset), n);
			turnBy(ahead <= n / 2 ? ahead : ahead - n);
		},
	};
}
