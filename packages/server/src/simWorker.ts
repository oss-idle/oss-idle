import { parentPort } from 'node:worker_threads';

import {
	simInputFromWire,
	type SimInputWire,
	simResultToWire,
	simulateState,
} from './rulesets/mania/4k/simState';
import {
	loadSim,
	sim,
} from './sim';
import { readChart } from './simCharts';

/** One of the sim service's threads (simService.ts): plays what it is sent, one at a time,
 *  its chart read from the service's copy only when the sim holds nothing of it already. */

const port = parentPort!;
await loadSim();
port.on('message', (input: SimInputWire) => {
	try {
		const played = simulateState(simInputFromWire(input), () => readChart(input.checksum));
		port.postMessage({ result: simResultToWire(played) });
	} catch (e) {
		port.postMessage({ error: e instanceof Error ? e.message : String(e) });
	}
});
port.postMessage({ ready: `${sim().name} ${sim().version}` });
