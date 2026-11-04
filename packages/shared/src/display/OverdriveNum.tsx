import { OVERDRIVE_SYMBOL } from '../upgrades.js';
import BigNum from './BigNum.js';

/** An overdrive value, coloured by its size: "3.4σ", "2.41kσ". */
export default function OverdriveNum({ value }: { value: number }) {
	return <><BigNum value={value} theme='ember' decimals={1} />{OVERDRIVE_SYMBOL}</>;
}
