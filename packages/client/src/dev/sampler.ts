/**
 * The frame profiler's view of everything outside rAF callbacks: Chromium's JS
 * self-profiling sampler, which needs the page served with
 * `Document-Policy: js-profiling` (the dev server and the staging and PBE apps do).
 */

type Trace = {
	resources: string[];
	frames: {
		name: string;
		resourceId?: number;
	}[];
	stacks: {
		frameId: number;
		parentId?: number;
	}[];
	samples: {
		timestamp: number;
		stackId?: number;
	}[];
};

type JsProfiler = {
	stop(): Promise<Trace>;
	addEventListener(type: 'samplebufferfull', listener: () => void): void;
};

declare global {
	interface Window {
		Profiler?: new (options: { sampleInterval: number; maxBufferSize: number }) => JsProfiler;
	}
}

let running: JsProfiler | undefined;
let unavailable = 'the JS sampler is off (dev tools screen)';

/** Starts sampling; a full buffer (minutes of samples) starts over. */
export function startSampler(): void {
	try {
		if (!window.Profiler) throw new Error('no JS self-profiling in this browser');
		const sampler = new window.Profiler({
			sampleInterval: 1, maxBufferSize: 200_000,
		});
		sampler.addEventListener('samplebufferfull', () => {
			void sampler.stop();
			startSampler();
		});
		running = sampler;
	} catch (e) {
		unavailable = String(e);
	}
}

/** Everything sampled since the last call, and a fresh sampler for the next. */
export async function takeSamples(): Promise<Trace | string> {
	const sampler = running;
	if (!sampler) return unavailable;
	startSampler();
	return sampler.stop();
}

/** Each sample's stack as labels, innermost first; an empty stack is an idle thread. */
export function stacksOf(trace: Trace, label: (name: string, url: string) => string) {
	const frameLabels = trace.frames.map(f =>
		label(f.name, f.resourceId === undefined ? '' : trace.resources[f.resourceId]));
	const stackLabels: string[][] = [];
	const stackOf = (id: number): string[] => {
		if (stackLabels[id]) return stackLabels[id];
		const { frameId, parentId } = trace.stacks[id];
		const parent = parentId === undefined ? [] : stackOf(parentId);
		return stackLabels[id] = [frameLabels[frameId], ...parent];
	};
	return trace.samples.map(s => ({
		at: s.timestamp, stack: s.stackId === undefined ? [] : stackOf(s.stackId),
	}));
}
