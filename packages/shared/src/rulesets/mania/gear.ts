import { __ } from '../../i18n/translate.js';

const NUMERALS: [number, string][] = [
	[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
	[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** A gear tier: Roman numerals up to 3999, a grouped number past that. */
export const romanTier = (n: number): string => {
	if (n > 3999) return n.toLocaleString('en-US');
	let out = '';
	for (const [value, numeral] of NUMERALS) {
		for (; n >= value; n -= value) out += numeral;
	}
	return out;
};

/** Gear past the base ladder keeps climbing its number instead of repeating a
 *  name. Continues by the ladder's own last step. */
const extrapolate = (ladder: readonly (string | number)[], level: number): number => {
	const top = ladder.length - 1;
	const last = ladder[top] as number;
	const previous = ladder[top - 1] as number;
	return last + (last - previous) * (level - top);
};

/**
 * The localized label of a gear ladder's step `level`. String entries translate by
 * key; numeric ones fill `template`. Past the base ladder a prestige adds gear tiers:
 * the final name repeats with a tier number, while numeric gear just keeps climbing.
 */
export function gearLabel(
	ladder: readonly (string | number)[],
	template: string | undefined,
	level: number,
): string {
	const top = ladder.length - 1;
	const tier = level - top;
	const value = ladder[Math.min(level, top)];

	if (typeof value === 'number') {
		const climbed = tier > 0 ? extrapolate(ladder, level) : value;
		return template
			? __(template, undefined, { value: climbed })
			: String(climbed);
	}

	const name = __(value);
	if (tier <= 0) return name;
	// the final ladder entry is itself Tier I, so the first extra slot is Tier II
	return __('{name} Tier {tier}', undefined, {
		name, tier: romanTier(tier + 1),
	});
}
