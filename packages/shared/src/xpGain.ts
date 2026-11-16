import { Big } from './big.js';

/** Each skill's raw xp times its multiplier, floored. */
export const scaleXp = <S extends string>(
	raw: Readonly<Record<S, number>>,
	multipliers: (skill: S) => Big,
): Record<S, Big> => {
	const out = {} as Record<S, Big>;
	for (const skill of Object.keys(raw) as S[]) {
		out[skill] = multipliers(skill).mul(raw[skill]).floor();
	}
	return out;
};
