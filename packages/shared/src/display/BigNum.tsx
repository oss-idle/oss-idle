import {
	bigStyle,
	type BigTheme,
} from './bigTheme.js';
import { bignum } from './num.js';

type Props = {
	value: number,
	theme: BigTheme,
	/** decimals under 1000 */
	decimals?: number,
};

/** A number coloured by its size. */
export default function BigNum({ value, theme, decimals = 0 }: Props) {
	return <span style={bigStyle(value, theme)}>{bignum(value, decimals)}</span>;
}
