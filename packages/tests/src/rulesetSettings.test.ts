import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const store = new Map<string, string>([['autopilotDelay', '45']]);
vi.stubGlobal('localStorage', {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, v),
	key: (i: number) => [...store.keys()][i] ?? null,
	get length() { return store.size; },
});

const { SETTINGS } = await import('@oss-idle/client/db/settings');
const { selectedRuleset } = await import('@oss-idle/client/rulesets/registry');

describe('per-ruleset settings', () => {
	it('starts every ruleset from what 4K had saved', () => {
		expect(SETTINGS.autopilotDelay.of('mania7k').get()).toBe(45);
		expect(store.get('autopilotDelay:mania7k')).toBe('45');
	});

	it('keeps a pick in its own ruleset and follows the selected one', async () => {
		await selectedRuleset.set('mania7k');
		await SETTINGS.autopilotDelay.set(10);
		expect(store.get('autopilotDelay:mania7k')).toBe('10');
		expect(SETTINGS.autopilotDelay.of('mania4k').get()).toBe(45);

		await selectedRuleset.set('mania4k');
		expect(SETTINGS.autopilotDelay.get()).toBe(45);
		await selectedRuleset.set('mania7k');
		expect(SETTINGS.autopilotDelay.get()).toBe(10);
	});

	it('shows a ruleset written from elsewhere only while it is selected', async () => {
		await selectedRuleset.set('mania4k');
		await SETTINGS.autopilotMode.of('mania7k').set('LOOP');
		expect(SETTINGS.autopilotMode.get()).not.toBe('LOOP');
		await SETTINGS.autopilotMode.of('mania4k').set('SHUFFLE');
		expect(SETTINGS.autopilotMode.get()).toBe('SHUFFLE');
	});
});
