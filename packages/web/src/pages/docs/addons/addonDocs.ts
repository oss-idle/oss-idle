/** The add-on guide's examples and reference, in English only like the API docs. */

export const SCAFFOLD = `# a new add-on project, with the SDK
npx @oss-idle/addon-sdk-create@latest my-addon
cd my-addon
npm install
npm run build   # dist/my-addon.js: one file, ready to publish`;

export const CONTRACT = `// the whole contract: two exports
export const mount = (addon, host) => {
	// addon: { id, name, version, gameVersion, authorId, authorName }
	// host: { version, react, ruleset, state, api, editor }
	// host.ruleset.current(): the ruleset the player picked ('mania4k', ...);
	// host.ruleset.watch(ruleset => ...) follows it, tag an add-on made for one with its id
	// host.state.current(): what the game is doing; host.state.watch(state => ...) follows it
	console.log(\`\${addon.name} \${addon.version} on oss!idle \${host.version}\`);
};

export const unmount = () => {
	// undo everything mount did: listeners, timers, elements
};`;

export const API = `// API v2 as the signed-in player: no OAuth app, no token
const me = await host.api.me();
const play = await host.api.simulate({
	beatmap_id: 4212,
	rate: 1.2,
	skills: { speed: { level: 120, upgrades: 3 }, stamina: { level: 95 } },
});
console.log(me.username, play.rank, play.pp, play.xp);

// with the SDK: this.api, typed (AddonApi and the objects are exported)`;

export const STATE = `export const mount = (addon, host) => {
	let last = host.state.current();
	host.state.watch(state => {
		if (state.scene !== last.scene) console.log(\`now on \${state.scene}\`);
		// a new result: a play just ended
		if (state.result && state.result !== last.result) {
			console.log(state.result.failed ? 'failed' : state.result.grade, state.result.xp);
		}
		last = state;
	});
};

// the game stops the watcher when the add-on stops
export const unmount = () => {};`;

/** The game's state: each field, what it tells. */
export const STATE_FIELDS: [field: string, about: string][] = [
	[
		'scene',
		'The scene on screen: intro, menu, select, game, result, lobby, match, saver or editor.',
	],
	[
		'open',
		'What is open over the scene, the topmost one: genetic-choice, play-choice, web, options, '
			+ 'medals, community, skins, addons, character, queue, direct or mods. Missing when '
			+ 'nothing is open.',
	],
	[
		'selected',
		'Song select\'s selected difficulty: { beatmapId, setId, installed, downloading }. '
			+ 'installed is false for a difficulty that is only in the catalog.',
	],
	[
		'play',
		'The character\'s running play, wherever the player is: { beatmapId, rate, mods, startedAt, '
			+ 'endsAt }. Times are in ms, on the player\'s clock.',
	],
	[
		'result',
		'The last play that ended since the game started: { beatmapId, failed, grade?, accuracy?, '
			+ 'pp?, xp, endedAt }. xp is the XP gained, by skill, as decimal strings: XP values can exceed '
			+ 'any number type, so they are always strings. A failed play has no grade, accuracy or pp. '
			+ 'A play the player quits leaves no result.',
	],
	[
		'genes',
		'The genes the character can learn or upgrade now, with the climaxx it has: '
			+ '[{ id, name, skill, tier, price, does }]. tier is the one the gene would reach, price '
			+ 'what it costs in climaxx, does what it would do then, in the player\'s language. Empty '
			+ 'when nothing can be bought.',
	],
	[
		'genetics',
		'The character\'s genetics, whole: { picks, skills, genes }. picks is the skills it was born '
			+ 'good at. skills is every skill in ring order with its climaxx as text: '
			+ '[{ skill, climaxx }]. genes is every gene of the ruleset: '
			+ '[{ id, name, skill, parent?, tier, max, does }], where parent is the gene learned '
			+ 'before it, tier the one it holds (0: not learned), max its last, and does what it '
			+ 'does at the tier held, or would at its first.',
	],
];

export const SDK_ADDON = `import { Addon, defineAddon } from '@oss-idle/addon-sdk';

class Hello extends Addon {
	constructor() {
		super({ name: 'Hello' });
	}

	onMount() {
		// removed for you when the add-on stops
		this.on(window, 'keydown', e => {
			if (e.key === 'F8') this.log.info('hello');
		});
	}
}

export const { mount, unmount } = defineAddon(() => new Hello());`;

export const CAN_UPDATE = `// hold auto-updates while busy
export const canUpdate = () => !recording;

// with the SDK: override canUpdate() in your Addon class, and export it too
export const { mount, unmount, canUpdate } = defineAddon(() => new Recorder());`;

export const SHARED_REACT = `// addon.config.json
{
	"name": "My add-on",
	"entry": "src/index.tsx",
	"outfile": "dist/my-addon.js",
	"sharedReact": true
}

// src/index.tsx: import React as usual, the game's copy is used
import { useState } from 'react';`;

export const EDITOR_EXAMPLE = `export const mount = (addon, host) => {
	host.editor.watch(editor => {
		// an entry in Ctrl+K, with keys the player can rebind
		editor.addAction({
			id: 'mirror-selection',
			label: 'Mirror the selected notes',
			keys: ['Alt+M'],
			run: () => {
				const picked = new Set(editor.selection());
				const notes = editor.notes().map(note => picked.has(note)
					? { ...note, column: editor.keys - 1 - note.column }
					: note);
				editor.edit({ notes }); // one undo step
			},
		});

		// the add-on's own window, drawn with the game's React
		const { createElement, useState, useEffect } = host.react['react'];
		const { createRoot } = host.react['react-dom/client'];
		editor.openWindow({
			title: 'Note count',
			render: element => {
				const Count = () => {
					const [count, setCount] = useState(editor.notes().length);
					useEffect(() => editor.onChange(() => setCount(editor.notes().length)), []);
					return createElement('b', null, \`\${count} notes\`);
				};
				const root = createRoot(element);
				root.render(createElement(Count));
				return () => root.unmount();
			},
		});
	});
};

export const unmount = () => {};`;

/** The editor API: what it is, what it does. */
export const EDITOR_API: [signature: string, about: string][] = [
	[
		'keys',
		'The number of columns.',
	],
	[
		'notes()',
		'The notes: { time, column, end?, hitSound, sample }, end making a long note.',
	],
	[
		'timing()',
		'The BPM points: { time, beatLength, meter, sound, effects }.',
	],
	[
		'scroll()',
		'The scroll speed (SV) points; beatLength is -100 / the multiplier.',
	],
	[
		'metadata()',
		'Title, artist, creator, version (the difficulty name), source, tags, preview '
			+ 'time.',
	],
	[
		'bookmarks()',
		'The bookmarked times, in ms.',
	],
	[
		'text()',
		'The .osu file as it stands, saved or not.',
	],
	[
		'edit(change, select?)',
		'Change notes, timing, scroll, bookmarks and metadata in one undoable step, '
			+ 'selecting the notes given after it. Hand it new objects: never change the '
			+ 'editor\'s.',
	],
	[
		'undo(), redo(), save()',
		'As the editor\'s own keys do.',
	],
	[
		'selection(), select(notes)',
		'The selected notes, and selecting others.',
	],
	[
		'now(), seek(ms)',
		'The song\'s time, and moving it.',
	],
	[
		'play(), pause(), isPlaying()',
		'The song.',
	],
	[
		'snap(ms), divisor(), setDivisor(n)',
		'A time on the nearest beat line of the current snap, the snap (4 for 1/4), and '
			+ 'changing it.',
	],
	[
		'onChange(callback)',
		'Runs after every edit, undo, selection or view change. Returns what stops it.',
	],
	[
		'addAction({ id, label, keys?, run })',
		'An entry in Ctrl+K, under Add-ons; its keys are the player\'s to rebind.',
	],
	[
		'addTab({ id, label, render })',
		'A tab beside Compose, Timing and the rest.',
	],
	[
		'addPanel({ id, title?, render })',
		'A panel at the foot of the right column.',
	],
	[
		'openWindow({ title, width?, height?, render, onClose? })',
		'A window over the editor the player can move, resize and close: the place for an '
			+ 'add-on\'s own UI. Returns { close }.',
	],
];
