import {
	expect,
	it,
	vi,
} from 'vitest';

import Synced from '@oss-idle/shared/helpers/synced';

const { errorPopup, json } = vi.hoisted(() => ({
	errorPopup: vi.fn(),
	json: (body: unknown) => Promise.resolve({
		ok: true, json: () => Promise.resolve(body), 
	}),
}));

vi.mock('@oss-idle/shared/helpers/log', () => ({
	default: {
		errorPopup, popup: vi.fn(), 
	}, POPUP_TYPE: {},
}));
vi.mock('@oss-idle/shared/desktop', () => ({ desktop: () => undefined }));
vi.mock('../../client/src/online/client', () => ({
	rpc: {
		v1: {
			auth: {
				me: {
					$get: () => json({
						id: 1, username: 'new', 
					}), 
				}, 
			},
			// the server's answer before onboarding
			me: { character: { $get: () => json(null) } },
		},
	},
}));
vi.mock('../../client/src/online/auth', async () => {
	const { default: S } = await import('@oss-idle/shared/helpers/synced');
	return { default: { user: new S(undefined) } };
});
vi.mock(
	'../../client/src/db/schema/character',
	() => ({ default: { localCurrent: async () => undefined } }),
);
vi.mock(
	'../../client/src/db/settings',
	() => ({ SETTINGS: { guestRuleset: { get: () => 'mania4k' } } }),
);
vi.mock('../../client/src/entity/entities', () => ({
	default: {
		character: { set: vi.fn() }, placeholder: vi.fn(), 
	}, 
}));
vi.mock('../../client/src/globals', () => ({ isWebOpen: { set: vi.fn() } }));
vi.mock('../../client/src/rulesets/registry', () => ({
	loadRuleset: vi.fn(), played: (r: string) => r, selectedRuleset: { set: vi.fn() },
}));
vi.mock('../../client/src/online/projectPending', () => ({}));
vi.mock('../../client/src/online/scoreSync', () => ({}));

it('a new account goes to character creation, online', async () => {
	vi.stubGlobal('window', { addEventListener: vi.fn() });
	vi.stubGlobal('localStorage', { setItem: vi.fn() });
	const { default: Account } = await import('../../client/src/online/account');
	await Account.ready();
	await Synced.all([Account.online], () => undefined);

	expect(errorPopup).not.toHaveBeenCalled();
	expect(Account.online.get()).toBe(true);
	expect(Account.needsOnboarding.get()).toBe(true);
	expect(Account.character.get()).toBeNull();
});
