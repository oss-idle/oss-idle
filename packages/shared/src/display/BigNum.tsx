import type { BigLike } from '../big.js';
import {
	bigStyle,
	type BigTheme,
} from './bigTheme.js';
import { formatBig } from './num.js';

type Props = {
	value: BigLike,
	theme: BigTheme,
	/** decimals under 1000 */
	decimals?: number,
};

/** A number coloured by its size. */
export default function BigNum({ value, theme, decimals = 0 }: Props) {
	return <span style={bigStyle(value, theme)}>{formatBig(value, decimals)}</span>;
}
