import { sim4k } from './4k/sim.js';
import { sim7k } from './7k/sim.js';
import type { Sims } from './sim.js';

/** The game's own sims, what anything but the main server plays with. */
export const publicSims: Sims = {
	mania4k: sim4k,
	mania7k: sim7k,
};
