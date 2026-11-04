import { desktop } from '@oss-idle/shared/desktop';

import {
	type DevTool,
	devTools,
} from './devTools';

/**
 * Staging only: the screen before the game loads, picking which dev tools run.
 * Plain DOM, since React isn't up yet. The last picks are remembered.
 */

const PICKS_KEY = 'dev-tools';

const TOOLS: [DevTool, string, string][] = [
	['profiler', 'Profiler',
		'Frame profiler: Ctrl+F11 overlay, Ctrl+Alt+F11 sends a report; else Ctrl+Shift+F11 loads it'],
	['sampler', 'JS sampler', 'Stacks in profiler reports; its sampling makes frames stutter'],
	['traceLaunch', 'Trace from launch', 'Chromium trace of the next 10s (Ctrl+Shift+F12 sends early)'],
	['debug', 'Debug mode', 'Debug plays, strain debug, gameplay debug controls, XP multiplier'],
	['playground', 'Playground', 'The component bench instead of the game'],
	['testBridge', 'Test bridge', 'window.__idle, the e2e suite\'s handle'],
];

const readPicks = (): Partial<Record<DevTool, boolean>> => {
	try {
		return JSON.parse(localStorage.getItem(PICKS_KEY) ?? '{}');
	} catch {
		return {};
	}
};

const option = ([tool, label, hint]: typeof TOOLS[number], checked: boolean) => {
	const row = document.createElement('label');
	row.style.cssText = 'display:flex;gap:10px;align-items:baseline;padding:6px 0;cursor:pointer';
	const box = document.createElement('input');
	box.type = 'checkbox';
	box.name = tool;
	box.checked = checked;
	const text = document.createElement('span');
	text.innerHTML = `<b>${label}</b> <span style="opacity:.6">${hint}</span>`;
	row.append(box, text);
	return row;
};

/** The release stream to run: one per branch on test, each its own build and server. */
const streamPicker = async () => {
	const update = desktop()?.update;
	const { current, streams } = await update?.streams?.() ?? {
		current: '', streams: [], 
	};
	if (streams.length < 2) return undefined;
	const row = document.createElement('label');
	row.style.cssText = 'display:flex;gap:10px;align-items:baseline;padding:12px 0 0';
	const select = document.createElement('select');
	select.style.font = 'inherit';
	for (const name of streams) select.add(new Option(name, name, false, name === current));
	row.append(Object.assign(document.createElement('b'), { textContent: 'Release stream' }), select);
	return {
		row, current, select, 
	};
};

/** Leave for another stream's build: the app installs it and restarts. */
const switchTo = async (form: HTMLFormElement, name: string) => {
	const update = desktop()!.update;
	const title = Object.assign(document.createElement('h2'), { textContent: `Switching to ${name}…` });
	const note = document.createElement('p');
	form.replaceChildren(title, note);
	update.onStatus(s => {
		note.textContent = s.state === 'downloading' ? `${s.percent}%`
			: s.state === 'error' ? s.message
				: s.state === 'none' ? 'No build on that stream' : '';
	});
	await update.switchStream!(name);
};

export async function chooseDevTools(): Promise<void> {
	const picks = readPicks();
	const stream = await streamPicker();
	const form = document.createElement('form');
	form.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;'
		+ 'justify-content:center;padding:0 max(24px,calc(50vw - 260px));'
		+ 'background:#05040a;color:#fff;font:15px system-ui,sans-serif;z-index:var(--z-dev)';
	form.innerHTML = '<h2 style="margin:0 0 12px">oss!idle staging: dev tools</h2>';
	form.append(...TOOLS.map(tool => option(tool, !!picks[tool[0]])));
	if (stream) form.append(stream.row);
	const start = document.createElement('button');
	start.textContent = 'Start';
	start.style.cssText = 'margin-top:16px;align-self:flex-start;padding:8px 24px;font:inherit';
	form.append(start);
	document.body.append(form);
	start.focus();

	return new Promise(resolve => form.addEventListener('submit', e => {
		e.preventDefault();
		if (stream && stream.select.value !== stream.current) {
			void switchTo(form, stream.select.value);
			return;
		}
		for (const [tool] of TOOLS) {
			devTools[tool] = (form.elements.namedItem(tool) as HTMLInputElement).checked;
		}
		try { localStorage.setItem(PICKS_KEY, JSON.stringify(devTools)); } catch { /* private mode */ }
		form.remove();
		resolve();
	}));
}
