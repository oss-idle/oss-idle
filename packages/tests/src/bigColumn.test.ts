import { mysqlTable } from 'drizzle-orm/mysql-core';
import {
	describe,
	expect,
	it,
} from 'vitest';

import { Big } from '@oss-idle/shared/big';

import { bigColumn } from '../../server/src/db/schema/bigColumn';

const { v } = mysqlTable('t', { v: bigColumn() });

describe('bigColumn', () => {
	it('is a VARCHAR(40)', () => {
		expect(v.getSQLType()).toBe('varchar(40)');
		expect(v.notNull).toBe(true);
	});

	it('writes the text form', () => {
		expect(v.mapToDriverValue(Big.from(2780.500308474033))).toBe('2780.500308474033');
		expect(v.mapToDriverValue(Big.from('1.5e400'))).toBe('1.5e400');
	});

	it('reads the text form', () => {
		expect(v.mapFromDriverValue('1e400').log10()).toBe(400);
		expect(v.mapFromDriverValue('2780.500308474033').toNumber()).toBe(2780.500308474033);
	});

	it('reads the number a row not yet migrated returns', () => {
		expect(v.mapFromDriverValue(123 as never).toNumber()).toBe(123);
		expect(v.mapFromDriverValue(9007199254740991n as never).toNumber()).toBe(9007199254740991);
	});

	it('refuses what is not a number', () => {
		expect(() => v.mapFromDriverValue('abc')).toThrow();
	});
});
