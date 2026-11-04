import { bignum } from './num.js';

const rank = (n?: number | null) => 
	(n === null || n === undefined ? '-' : `#${bignum(n)}`);

export default rank;