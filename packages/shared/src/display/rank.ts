import { formatBig } from './num.js';

const rank = (n?: number | null) => 
	(n === null || n === undefined ? '-' : `#${formatBig(n)}`);

export default rank;