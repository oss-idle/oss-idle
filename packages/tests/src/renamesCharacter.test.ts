import {
	describe,
	expect,
	it,
} from 'vitest';

import { renamesCharacter } from '@oss-idle/shared/groups';

const player = {
	id: 10, userId: 10, groups: [], 
};
const admin = {
	id: 20, userId: 20, groups: ['admin' as const], 
};

describe('renamesCharacter', () => {
	it('lets players rename only their own character', () => {
		expect(renamesCharacter({ id: 10 }, player)).toBe(true);
		expect(renamesCharacter({ id: 11 }, player)).toBe(false);
	});
	it('lets moderators rename anyone but admins', () => {
		expect(renamesCharacter({
			id: 30, groups: ['gmt'], 
		}, player)).toBe(true);
		expect(renamesCharacter({
			id: 30, groups: ['gmt'], 
		}, admin)).toBe(false);
		expect(renamesCharacter({
			id: 40, groups: ['admin'], 
		}, admin)).toBe(true);
	});
});
