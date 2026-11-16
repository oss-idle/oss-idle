import {
	describe,
	expect,
	it,
} from 'vitest';

import { layered } from '@oss-idle/client/osu/skin/layered';
import type { SkinSource } from '@oss-idle/client/osu/skin/OsuSkin';

const memorySource = (files: Record<string, string>): SkinSource => ({
	paths: Object.keys(files).map(path => path.toLowerCase()),
	read: async path => {
		const found = Object.entries(files).find(([name]) => name.toLowerCase() === path);
		return found && new Blob([found[1]]);
	},
});

describe('a beatmap skin over the player\'s skin', () => {
	const map = memorySource({ 'mania-note1T.png': 'map tail' });
	const player = memorySource({
		'mania-note1T@2x.png': 'player tail @2x',
		'mania-note1T-0.png': 'player tail frame',
		'mania-note1.png': 'player note',
		'skin.ini': '[General]',
	});
	const skin = layered(map, player);

	it('takes the map\'s element over every variant of it in the player\'s skin', async () => {
		expect(skin.paths.sort()).toEqual(['mania-note1.png', 'mania-note1t.png', 'skin.ini']);
		expect(await (await skin.read('mania-note1t.png'))?.text()).toBe('map tail');
	});

	it('keeps the player\'s other elements and settings', async () => {
		expect(await (await skin.read('mania-note1.png'))?.text()).toBe('player note');
		expect(await (await skin.read('skin.ini'))?.text()).toBe('[General]');
	});
});
