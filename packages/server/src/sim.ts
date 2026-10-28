import { z } from 'zod';

import type { Sims } from '@oss-idle/shared/rulesets/mania/sim';
import { publicSims } from '@oss-idle/shared/rulesets/mania/sims';
import { VERSION } from '@oss-idle/shared/version';

/** The private play simulation: installed on the main servers only, never part of this repo. */
const PRIVATE = '@oss-idle/sim-private';

type Loaded = Sims & { name: 'public' | 'private', version: string };

let loaded: Loaded | undefined;

const missing = (e: unknown) =>
	e instanceof Error && e.message.includes(`Cannot find package '${PRIVATE}'`);

/** Pick the play simulation, once before anything plays (boot, a script's start): the
 *  private package when it is installed, else the game's own, as `SIM` says. */
export const loadSim = async (): Promise<void> => {
	// read here rather than in env.ts, so the sim service runs with no other configuration:
	// `private` refuses to start without the private package, `public` never loads it,
	// unset takes the private one when it is installed
	const SIM = z.enum(['public', 'private']).optional().parse(process.env.SIM);
	loaded = {
		...publicSims, name: 'public', version: VERSION,
	};
	if (SIM !== 'public') {
		try {
			const mod = await import(PRIVATE) as { sims: Sims, version: string };
			loaded = {
				...mod.sims, name: 'private', version: mod.version,
			};
		} catch (e) {
			if (!missing(e) || SIM === 'private') throw e;
		}
	}
	console.log(`Play simulation: ${loaded.name} ${loaded.version}`);
};

/** The play simulation {@link loadSim} picked. */
export const sim = (): Loaded => {
	if (!loaded) throw new Error('the play simulation is not loaded (loadSim)');
	return loaded;
};

/** The score version plays are simulated on now: a score stored on an older one is
 *  reprocessed (db/reprocess) until every score is on it. */
export const SCORE_VERSION = 2;
