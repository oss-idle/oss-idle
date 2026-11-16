import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/mysql-core';

import {
	type Big,
	fromWire,
	toText,
} from '@oss-idle/shared/big';

/** A Big as its text form. Reads the number a row not yet migrated returns too. */
const bigText = customType<{ data: Big; driverData: string }>({
	dataType: () => 'varchar(40)',
	toDriver: toText,
	fromDriver: value => fromWire(typeof value === 'bigint' ? String(value) : value),
});

export const bigColumn = () => bigText().notNull().default(sql`'0'`);
