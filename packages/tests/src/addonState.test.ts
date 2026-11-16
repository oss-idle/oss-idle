import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import {
	Big,
	ZERO,
} from '@oss-idle/shared/big';

import { followGame } from '@oss-idle/client/addons/followGame';
import { hostFor } from '@oss-idle/client/addons/host';
import {
	type GameState,
	recordResult,
	showSelected,
	stateHost,
} from '@oss-idle/client/addons/state';

const stores = await vi.hoisted(async () => {
	const { default: Synced } = await import('@oss-idle/shared/helpers/synced');
	return {
		scene: new Synced('INTRO'),
		isWebOpen: new Synced(false),
		isOptionsOpen: new Synced(false),
		isCommunityOpen: new Synced(false),
		isPlayChoiceOpen: new Synced(false),
		geneticChoice: new Synced<string | undefined>(undefined),
		openPage: new Synced<{ page: string } | undefined>(undefined),
		modSelectOpen: new Synced(false),
		shownMedals: new Synced<object | undefined>(undefined),
		live: new Synced<object | undefined>(undefined),
	};
});

vi.mock('@oss-idle/client/globals', () => ({
	...stores, message: { set: () => {} },
}));
vi.mock('@oss-idle/client/scenes/SceneManager', () => ({ default: { current: stores.scene } }));
vi.mock(
	'@oss-idle/client/components/mods/modSelectOpen',
	() => ({ modSelectOpen: stores.modSelectOpen }),
);
vi.mock('@oss-idle/client/online/medalWatch', () => ({ shownMedals: stores.shownMedals }));
vi.mock('@oss-idle/client/online/playManager', () => ({ default: { live: stores.live } }));
vi.mock('@oss-idle/client/online/client', () => ({ BASE_URL: 'https://api.test' }));
vi.mock(
	'@oss-idle/client/rulesets/registry',
	() => ({ selectedRuleset: { get: () => 'mania4k' } }),
);

followGame();

const state = () => stateHost.current();

const live = (token: string, endsAt: number, accuracy?: number) => ({
	token,
	beatmap: { metadata: { id: 7 } },
	rate: 1.1,
	mods: ['HR'],
	startedAt: 1000,
	endsAt,
	accuracy,
});

describe('host.state', () => {
	it('has nothing but current and watch', () => {
		expect(Object.keys(globalThis.ossIdle.state)).toEqual(['current', 'watch']);
		expect(Object.keys(hostFor().host.state)).toEqual(['current', 'watch']);
	});

	it('follows the scene', async () => {
		expect(state()).toEqual({ scene: 'intro' });
		await stores.scene.set('SELECT');
		expect(state().scene).toBe('select');
	});

	it('names the topmost thing open', async () => {
		const opens: [{ set: (v: never) => Promise<void> }, unknown, GameState['open']][] = [
			[stores.modSelectOpen, true, 'mods'],
			[stores.openPage, { page: 'skins' }, 'skins'],
			[stores.isCommunityOpen, true, 'community'],
			[stores.shownMedals, {
				waves: [], held: 1,
			}, 'medals'],
			[stores.isOptionsOpen, true, 'options'],
			[stores.isWebOpen, true, 'web'],
			[stores.isPlayChoiceOpen, true, 'play-choice'],
			[stores.geneticChoice, 'first', 'genetic-choice'],
		];
		expect(state().open).toBeUndefined();
		for (const [store, value, open] of opens) {
			await store.set(value as never);
			expect(state().open).toBe(open);
		}
		for (const [i, [store, value]] of [...opens.entries()].reverse()) {
			await store.set((typeof value === 'boolean' ? false : undefined) as never);
			expect(state().open).toBe(opens[i - 1]?.[2]);
		}
	});

	it('tells the selected difficulty, installed or not', () => {
		showSelected({
			metadata: {
				id: 5, runtime: true,
			},
			set: { metadata: { id: 2 } },
		}, false);
		expect(state().selected).toEqual({
			beatmapId: 5, setId: 2, installed: true, downloading: false,
		});
		showSelected({
			metadata: { id: 6 }, set: { metadata: { id: 3 } },
		}, true);
		expect(state().selected).toEqual({
			beatmapId: 6, setId: 3, installed: false, downloading: true,
		});
		showSelected(undefined, false);
		expect(state().selected).toBeUndefined();
	});

	it('tells the running play, and keeps it while only its score moves', async () => {
		const first = live('a', 9000, 1);
		await stores.live.set(first);
		const play = state().play;
		expect(play).toEqual({
			beatmapId: 7, rate: 1.1, mods: ['HR'], startedAt: 1000, endsAt: 9000,
		});
		expect(play?.mods).not.toBe(first.mods);

		const before = state();
		await stores.live.set(live('a', 9020, 0.98));
		expect(state()).toBe(before);

		await stores.live.set(live('a', 7000, 0.98));
		expect(state().play?.endsAt).toBe(7000);
		await stores.live.set(live('b', 20000));
		expect(state().play?.endsAt).toBe(20000);
		await stores.live.set(undefined);
		expect(state().play).toBeUndefined();
	});

	it('keeps the last result, failed ones too', () => {
		const gain = (skill: string, gained: number) => ({
			skill, gained: Big.from(gained), fromLevel: 1, fromXp: ZERO, toLevel: 1, toXp: Big.from(gained),
			levels: 0,
		});
		recordResult(7, false, {
			grade: 'S', accuracy: 0.97, pp: 120,
		}, [gain('speed', 50), gain('stamina', 0)]);
		expect(state().result).toEqual({
			beatmapId: 7,
			failed: false,
			grade: 'S',
			accuracy: 0.97,
			pp: 120,
			xp: { speed: '50' },
			endedAt: expect.any(Number),
		});
		recordResult(8, true);
		expect(state().result).toEqual({
			beatmapId: 8, failed: true, xp: {}, endedAt: expect.any(Number),
		});
	});

	it('hands out plain data nobody can change', async () => {
		await stores.live.set(live('c', 30000));
		const now = state();
		expect(JSON.parse(JSON.stringify(now))).toEqual(now);
		expect(Object.isFrozen(now)).toBe(true);
		expect(Object.isFrozen(now.play?.mods)).toBe(true);
		expect(Object.isFrozen(now.result?.xp)).toBe(true);
		await stores.live.set(undefined);
		expect(state().result).toBe(now.result);
	});

	it('calls a watcher now and on every change, until it is stopped', async () => {
		const seen: string[] = [];
		const stop = stateHost.watch(s => seen.push(s.scene));
		expect(seen).toEqual(['select']);
		await stores.scene.set('GAME');
		await stores.scene.set('GAME');
		expect(seen).toEqual(['select', 'game']);
		stop();
		await stores.scene.set('RESULT');
		expect(seen).toEqual(['select', 'game']);
	});

	it('stops an add-on\'s watchers when the add-on stops', async () => {
		const {
			host, release,
		} = hostFor();
		const seen: string[] = [];
		host.state.watch(s => seen.push(s.scene));
		host.state.watch(s => seen.push(s.scene));
		expect(seen).toEqual(['result', 'result']);
		release();
		await stores.scene.set('MENU');
		expect(seen).toEqual(['result', 'result']);
		expect(host.state.current().scene).toBe('menu');
	});
});
