/**
 * Frame profiler. Ctrl+F11 toggles the overlay, Ctrl+Shift+F11 resets the totals
 * (or, when it isn't loaded, loads it with the JS sampler and shows it),
 * Ctrl+Alt+F11 (or `__profiler.report()`) prints a report to the console and uploads
 * it to the dev server, which keeps it in profiles/ at the repo root. A release build
 * saves it as a file instead.
 *
 * - every requestAnimationFrame callback is timed and labelled by the call site
 *   that queued it; callbacks over 4ms also land in the DevTools Performance
 *   panel as `rAF …` measures
 * - per frame: its start, the gap to the next frame and the rAF work inside it
 * - a JS sampler (sampler.ts) for the main thread's time outside rAF callbacks,
 *   matched to the dropped frames
 * - the browser's long-animation-frame entries (Chromium, over 50ms only)
 * - what the game was doing (profileContext.ts)
 *
 * Loaded from main.tsx at launch in dev or when a staging build's menu picks it, and
 * otherwise only once Ctrl+Shift+F11 asks for it.
 */

import { VERSION } from '@oss-idle/shared/version';

import { SETTINGS } from '../db/settings';
import { SITE_URL } from '../globals';
import {
	DEV_TOOLS,
	devTools,
} from './devTools';
import { flash } from './flash';
import {
	context,
	stateAt,
	timeline,
} from './profileContext';
import {
	stacksOf,
	startSampler,
	takeSamples,
} from './sampler';

type Stat = {
	total: number;
	max: number;
	calls: number;
};

type LoafScript = {
	invoker: string;
	sourceURL: string;
	sourceFunctionName: string;
	duration: number;
	forcedStyleAndLayoutDuration: number;
};

type Loaf = PerformanceEntry & {
	blockingDuration: number;
	renderStart: number;
	styleAndLayoutStart: number;
	scripts: LoafScript[];
};

type LongFrame = {
	at: number;
	duration: number;
	blocking: number;
	render: number;
	forcedLayout: number;
	top: string;
};

type Sample = ReturnType<typeof stacksOf>[number];

const VISIBLE_KEY = 'profiler-visible';
// reports cover the last minute, whatever the refresh rate; the overlay the last GRAPH frames
const REPORT_MS = 60_000;
const FRAMES = 40_000;
const GRAPH = 300;
const SLOW_CALLBACK_MS = 4;
const DROP_RATIO = 1.5;

const callbacks = new Map<string, Stat>();
const scripts = new Map<string, Stat>();
const longFrames: LongFrame[] = [];
const starts = new Float64Array(FRAMES);
const gaps = new Float32Array(FRAMES);
const work = new Float32Array(FRAMES);
let head = 0;
let recorded = 0;
let frameAt = 0;
let frameWork = 0;

const add = (stats: Map<string, Stat>, key: string, ms: number) => {
	const stat = stats.get(key) ?? {
		total: 0, max: 0, calls: 0,
	};
	stat.total += ms;
	stat.max = Math.max(stat.max, ms);
	stat.calls++;
	stats.set(key, stat);
};

// dev serves src/, a staging build one hashed file per module under assets/
const shortUrls = (text: string) => text
	.replace(/\S*?\/(?:src|deps|dist|assets)\/([^?\s]+)\S*/g, '$1')
	.replace(/-[\w-]{8}\.js\b/g, '.js');

/** All callbacks of one frame get the same timestamp: a new one closes the last. */
const mark = (now: number) => {
	if (now === frameAt) return;
	if (frameAt) {
		starts[head] = frameAt;
		gaps[head] = now - frameAt;
		work[head] = frameWork;
		head = (head + 1) % FRAMES;
		recorded = Math.min(recorded + 1, FRAMES);
	}
	frameAt = now;
	frameWork = 0;
};

// stack: Error, callSite, the wrapper below, then whoever queued the callback. Its
// line numbers are the transpiled module's, so only the file is kept.
const callSite = () => {
	const line = new Error().stack?.split('\n')[3] ?? '';
	return shortUrls(line.match(/\(?([^\s(]+):\d+:\d+\)?$/)?.[1] ?? line.trim());
};

const labels = new WeakMap<FrameRequestCallback, string>();
const queue = window.requestAnimationFrame;

window.requestAnimationFrame = callback => {
	let label = labels.get(callback);
	if (!label) labels.set(callback, label = `${callback.name || '(anonymous)'} @ ${callSite()}`);
	const named = label;
	return queue(function timed(now) {
		mark(now);
		const start = performance.now();
		try {
			callback(now);
		} finally {
			const ms = performance.now() - start;
			frameWork += ms;
			add(callbacks, named, ms);
			if (ms > SLOW_CALLBACK_MS) {
				performance.measure(`rAF ${named}`, {
					start, duration: ms,
				});
			}
		}
	});
};

// keeps frames counted while nothing else animates
const pulse = (now: number) => {
	mark(now);
	queue(pulse);
};
queue(pulse);
if (devTools.sampler) startSampler();

const scriptKey = (s: LoafScript) =>
	shortUrls([s.invoker, s.sourceFunctionName, s.sourceURL].filter(Boolean).join(' '));

const onLongFrame = (entry: Loaf) => {
	const end = entry.startTime + entry.duration;
	let top: LoafScript | undefined;
	let forcedLayout = 0;
	for (const script of entry.scripts) {
		add(scripts, scriptKey(script), script.duration);
		forcedLayout += script.forcedStyleAndLayoutDuration;
		if (!top || script.duration > top.duration) top = script;
	}
	longFrames.push({
		at: entry.startTime,
		duration: entry.duration,
		blocking: entry.blockingDuration,
		render: entry.renderStart ? end - entry.renderStart : 0,
		forcedLayout,
		top: top ? `${top.duration.toFixed(0)}ms ${scriptKey(top)}` : '(no script)',
	});
	if (longFrames.length > 50) longFrames.shift();
};

if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
	new PerformanceObserver(list => list.getEntries().forEach(e => onLongFrame(e as Loaf)))
		.observe({
			type: 'long-animation-frame', buffered: true,
		});
}

const reset = () => {
	callbacks.clear();
	scripts.clear();
	longFrames.length = 0;
	performance.clearMeasures();
};

const top = (stats: Map<string, Stat>, n: number) =>
	[...stats].sort(([, a], [, b]) => b.total - a.total).slice(0, n);

const row = ([key, s]: [string, Stat]) =>
	`${s.total.toFixed(0).padStart(7)} ${s.max.toFixed(1).padStart(6)}`
	+ ` ${String(s.calls).padStart(6)}  ${key}`;

const heapMb = () => {
	const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
	return memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(0)}MB` : '?';
};

/** The last n recorded frames, oldest first. */
const recent = <T extends Float32Array | Float64Array>(ring: T, n: number) => {
	const count = Math.min(n, recorded);
	return Array.from({ length: count }, (_, i) => ring[(head - count + i + FRAMES) % FRAMES]);
};

/** How many of the recorded frames started within the last ms. */
const framesWithin = (ms: number) => {
	const since = performance.now() - ms;
	return recent(starts, FRAMES).filter(start => start >= since).length;
};

const summary = (n: number) => {
	const sorted = recent(gaps, n).sort((a, b) => a - b);
	const p = (q: number) => sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
	const median = p(0.5);
	const drops = sorted.filter(gap => gap > median * DROP_RATIO).length;
	return {
		median, p99: p(0.99), max: sorted[sorted.length - 1] ?? 0, drops, frames: sorted.length,
	};
};

const text = (n = GRAPH) => {
	const s = summary(n);
	return [
		`fps ${(1000 / (s.median || 1)).toFixed(0)}  p50 ${s.median.toFixed(1)}`
		+ `  p99 ${s.p99.toFixed(1)}  max ${s.max.toFixed(0)}ms`
		+ `  drops ${s.drops}/${s.frames}  heap ${heapMb()}`,
		'rAF callbacks     total    max  calls',
		...top(callbacks, 8).map(row),
		'long-frame scripts',
		...top(scripts, 6).map(row),
		'last long frames',
		...longFrames.slice(-4).reverse().map(f =>
			`${f.duration.toFixed(0).padStart(4)}ms block ${f.blocking.toFixed(0)}`
			+ ` render ${f.render.toFixed(0)} forced-layout ${f.forcedLayout.toFixed(0)}  ${f.top}`),
	].join('\n');
};

const overlay = document.createElement('div');
overlay.style.cssText = 'position:fixed;top:4px;left:4px;z-index:var(--z-dev);pointer-events:none;'
	+ 'background:rgba(0,0,0,.8);color:#cfc;font:11px/1.3 monospace;padding:6px;'
	+ 'border-radius:4px;max-width:calc(100vw - 8px);overflow:hidden';
const graph = document.createElement('canvas');
graph.width = GRAPH;
graph.height = 60;
const info = document.createElement('pre');
info.style.margin = '4px 0 0';
const send = document.createElement('button');
send.textContent = DEV_TOOLS ? 'send report' : 'save report';
send.style.cssText = 'pointer-events:auto;display:block;margin-top:4px;font:inherit';
send.addEventListener('click', () => void report());
const keys = document.createElement('div');
keys.style.cssText = 'margin-top:4px;opacity:.7';
keys.textContent = 'Ctrl+F11 hide · Ctrl+Shift+F11 reset · Ctrl+Alt+F11 '
	+ (DEV_TOOLS ? 'send report' : 'save report · off at the next restart');
overlay.append(graph, info, send, keys);

/** One bar per frame: full height is 50ms, green is rAF work, red a dropped gap. */
const draw = () => {
	const ctx = graph.getContext('2d')!;
	const { median } = summary(GRAPH);
	const bars = recent(gaps, GRAPH);
	const busy = recent(work, GRAPH);
	ctx.clearRect(0, 0, GRAPH, 60);
	bars.forEach((gap, i) => {
		ctx.fillStyle = gap > median * DROP_RATIO ? '#f55' : '#557';
		ctx.fillRect(i, 60 - Math.min(gap, 50) * 1.2, 1, Math.min(gap, 50) * 1.2);
		ctx.fillStyle = '#5f5';
		ctx.fillRect(i, 60 - Math.min(busy[i], 50) * 1.2, 1, Math.min(busy[i], 50) * 1.2);
	});
	info.textContent = text();
};

let timer = 0;
export const show = (visible: boolean) => {
	try { localStorage.setItem(VISIBLE_KEY, visible ? '1' : ''); } catch { /* private mode */ }
	clearInterval(timer);
	if (!visible) return overlay.remove();
	document.body.append(overlay);
	timer = window.setInterval(draw, 250);
};

/** A notice in the middle of the screen, for the keys that change nothing visible. */
const round = (ms: number) => Math.round(ms * 10) / 10;

const sampleLabel = (name: string, url: string) =>
	`${name || '(anonymous)'}${url ? ` @ ${shortUrls(url)}` : ''}`;

/** Main-thread time by function: self (the sampled leaf) and total (anywhere on the stack). */
const sampleTables = (samples: Sample[]) => {
	const self = new Map<string, number>();
	const total = new Map<string, number>();
	for (const { stack } of samples) {
		if (!stack.length) continue;
		self.set(stack[0], (self.get(stack[0]) ?? 0) + 1);
		for (const label of new Set(stack)) total.set(label, (total.get(label) ?? 0) + 1);
	}
	const ranked = (counts: Map<string, number>) =>
		Object.fromEntries([...counts].sort(([, a], [, b]) => b - a).slice(0, 40));
	return {
		busy: samples.filter(s => s.stack.length).length, self: ranked(self), total: ranked(total),
	};
};

/** Each dropped frame of the last n, with what the sampler caught running in it. */
const droppedFrames = (n: number, samples: Sample[]) => {
	const { median } = summary(n);
	const frameStarts = recent(starts, n);
	const frameWork = recent(work, n);
	return recent(gaps, n).flatMap((gap, i) => {
		if (gap <= median * DROP_RATIO) return [];
		const at = frameStarts[i];
		return [{
			at: Math.round(at),
			gap: round(gap),
			rafWork: round(frameWork[i]),
			state: stateAt(at),
			sampled: samples
				.filter(s => s.at >= at && s.at < at + gap && s.stack.length)
				.map(s => s.stack.slice(0, 4).join(' < ')),
		}];
	});
};

const samplerReport = async (n: number) => {
	try {
		return await sampledReport(n);
	} catch (e) {
		return {
			sampler: `the JS sampler failed: ${e}`, drops: droppedFrames(n, []),
		};
	}
};

const sampledReport = async (n: number) => {
	const trace = await takeSamples();
	if (typeof trace === 'string') {
		return {
			sampler: trace, drops: droppedFrames(n, []),
		};
	}
	const since = performance.now() - REPORT_MS;
	const samples = stacksOf(trace, sampleLabel).filter(s => s.at >= since);
	const interval = samples.length > 1
		? round((samples[samples.length - 1].at - samples[0].at) / (samples.length - 1))
		: 0;
	return {
		sampler: {
			samples: samples.length, intervalMs: interval, ...sampleTables(samples),
		},
		drops: droppedFrames(n, samples),
	};
};

const snapshot = async () => {
	const n = framesWithin(REPORT_MS);
	return {
		at: new Date().toISOString(),
		version: VERSION,
		userAgent: navigator.userAgent,
		screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
		frameLimiter: SETTINGS.frameLimiter.get(),
		heap: heapMb(),
		context: context(),
		summary: summary(n),
		text: text(n),
		...await samplerReport(n),
		callbacks: Object.fromEntries(top(callbacks, 50)),
		scripts: Object.fromEntries(top(scripts, 50)),
		longFrames,
		timeline: timeline.filter(e => e.at >= performance.now() - REPORT_MS),
		// per frame, oldest first: its start, the gap to the next and its rAF work (ms)
		frames: {
			starts: recent(starts, n).map(Math.round),
			gaps: recent(gaps, n).map(round),
			work: recent(work, n).map(round),
		},
	};
};

/** The browser's download, or the desktop app's save dialog. */
const save = (body: Awaited<ReturnType<typeof snapshot>>) => {
	const link = document.createElement('a');
	link.href = URL.createObjectURL(new Blob([JSON.stringify(body)], { type: 'application/json' }));
	link.download = `oss-idle-profile-${body.at.replace(/[:.]/g, '-')}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
};

const report = async () => {
	flash(DEV_TOOLS ? 'Sending the profiler report...' : 'Saving the profiler report...');
	try {
		const body = await snapshot();
		console.log(body.text);
		console.table(body.callbacks);
		console.table(body.drops);
		if (!DEV_TOOLS) {
			save(body);
			flash(`Profiler report saved (${body.summary.drops} drops)`);
			return;
		}
		// a plain text POST needs no CORS preflight; the reply can't be read, only the send
		await fetch(`${SITE_URL}/__profile`, {
			method: 'POST', mode: 'no-cors', body: JSON.stringify(body),
		});
		flash(`Profiler report sent (${body.summary.drops} drops)`);
	} catch (e) {
		flash(`Profiler report failed: ${e}`);
	}
};

window.addEventListener('keydown', e => {
	if (e.key !== 'F11' || !e.ctrlKey) return;
	e.preventDefault();
	if (e.altKey) {
		void report();
	} else if (e.shiftKey) {
		reset();
		flash('Profiler totals reset');
	} else {
		show(!overlay.isConnected);
	}
}, { capture: true });

try { if (localStorage.getItem(VISIBLE_KEY)) show(true); } catch { /* private mode */ }

declare global {
	interface Window {
		__profiler?: {
			report: typeof report;
			reset: typeof reset;
		};
	}
}

window.__profiler = {
	report, reset,
};
