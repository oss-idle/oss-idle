/* eslint-disable @typescript-eslint/no-explicit-any */
import initSqlJs, {
	type Database,
	type SqlValue,
	type Statement,
} from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import Synced from '@oss-idle/shared/helpers/synced';
import {
	LEGACY_SAVE_DB,
	openSave,
	readSave,
	SAVE_DB,
	SAVE_KEY,
	SAVE_STORE,
} from '@oss-idle/shared/save';

import {
	markMigrated,
	migrate,
} from './migrations';
// import { debugMode } from '../globals';

/**
 * Tiny schema-first DAO for sql.js.
 *
 * Define a table once with column builders; the row type is *inferred* from
 * that same definition, so the schema and the usable TypeScript type never
 * drift apart. Column names are used verbatim in SQL, so the type, the schema
 * and the queries all speak the same vocabulary.
 *
 *   const users = table('user', {
 *     id:   integer().primaryKey().autoincrement(),
 *     name: text(),              // NOT NULL by default
 *     bio:  text().nullable(),   // opt out per column
 *   });
 *
 *   class User extends DAO(users) {
 *     // instances are typed with the row columns (id, name);
 *     // .add() / .update() / .delete() persist an instance;
 *     // static .get() / .getAll() fetch; add your own finders with DB:
 *     static named(name: string) {
 *       return this.query('SELECT * FROM user WHERE name = ?', [name]);
 *     }
 *   }
 *
 *   const user = new User({ name: 'Adri' });
 *   await user.add();                   // insert; user.id is filled in
 *
 *   const u = await User.get(1);        // -> User | undefined
 *   if (u) { u.name = 'Bob'; await u.update(); }
 *   await u?.delete();
 *
 * The connection is a single managed global ({@link DB}): defining a table
 * registers its schema, and the first access lazily boots sql.js, restores the
 * database from IndexedDB, and creates every registered table. Writes persist
 * back to IndexedDB automatically.
 */

type SqlType = 'INTEGER' | 'REAL' | 'TEXT';

/** Render an encoded value as a SQL literal for a DEFAULT clause. */
function sqlLiteral(v: SqlValue): string {
	if (v === null) return 'NULL';
	if (typeof v === 'number') return String(v);
	if (typeof v === 'string') return `'${v.replace(/'/g, '\'\'')}'`;
	throw new Error(`default value of type ${typeof v} is not supported`);
}

/**
 * A single column: its SQL type, the modifiers appended to its DDL, and the
 * codecs that translate between the stored {@link SqlValue} and the JS value.
 * `V` is the JS value type; `Opt` marks the column optional on the inferred row
 * (e.g. an autoincrement primary key the caller never supplies).
 */
export class Column<V, Opt extends boolean = false> {
	declare readonly _value: V;
	declare readonly _optional: Opt;

	modifiers = '';
	optional = false;
	isNullable = false;
	isUnique = false;
	isPrimaryKey = false;
	isAutoincrement = false;
	hasDefault = false;
	defaultValue?: V;

	constructor(
		readonly sqlType: SqlType,
		readonly encode: (v: V) => SqlValue = v => v as SqlValue,
		readonly decode: (v: SqlValue) => V = v => v as V,
	) {}

	/** Allow NULL.
	 * Columns are NOT NULL by default;
	 * this makes the field `| null` and optional on the row.
	 */
	nullable(): Column<V | null, true> {
		this.isNullable = true;
		this.optional = true;
		return this as unknown as Column<V | null, true>;
	}

	/**
	 * Set a default value. Emitted as a SQL DEFAULT *and* applied in-memory by the
	 * DAO constructor when the column is omitted, so a freshly-built instance
	 * carries the value too - not just rows read back from the DB. Makes the
	 * column optional on {@link Insert}.
	 */
	default(value: V): Column<V, true> {
		this.hasDefault = true;
		this.defaultValue = value;
		this.optional = true;
		this.modifiers += ` DEFAULT ${sqlLiteral(this.encode(value))}`;
		return this as unknown as Column<V, true>;
	}

	/**
	 * Set a raw SQL DEFAULT *expression* (e.g. `CURRENT_TIMESTAMP`). Unlike
	 * {@link default}, it is evaluated by SQLite only - not applied in-memory -
	 * so a freshly-built instance won't carry the value until the row is read
	 * back. Makes the column optional on {@link Insert}.
	 */
	defaultSql(expr: string): Column<V, true> {
		this.optional = true;
		this.modifiers += ` DEFAULT ${expr}`;
		return this as unknown as Column<V, true>;
	}

	primaryKey(): this {
		this.modifiers += ' PRIMARY KEY';
		this.isPrimaryKey = true;
		return this;
	}

	unique(): this {
		this.modifiers += ' UNIQUE';
		this.isUnique = true;
		return this;
	}

	autoincrement(): Column<V, true> {
		this.modifiers += ' AUTOINCREMENT';
		this.optional = true;
		this.isAutoincrement = true;
		return this as unknown as Column<V, true>;
	}
}

export const integer = () => new Column<number>('INTEGER');
export const real = () => new Column<number>('REAL');
export const text = <T extends string = string>() => new Column<T>('TEXT');
export const boolean = () => new Column<boolean>(
	'INTEGER', 
	v => (v ? 1 : 0),
	v => !!v,
);

type Columns = Record<string, Column<any, boolean>>;

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type OptionalKeys<C extends Columns> = {
	[K in keyof C]: C[K] extends Column<any, true> ? K : never 
}[keyof C];

/** The stored shape of a row - every column present. This is the instance / read type. */
export type Row<C extends Columns> = Prettify<{
	[K in keyof C]: C[K]['_value']
}>;

/**
 * The shape accepted when creating/inserting a row. Columns that the DB can fill
 * in itself - autoincrement keys, `.default(...)`, `.nullable()` - are optional
 * everything else is required.
 */
export type Insert<C extends Columns> = Prettify<
	{ [K in Exclude<keyof C, OptionalKeys<C>>]: C[K]['_value'] } &
	{ [K in OptionalKeys<C>]?: C[K]['_value'] }
>;

export interface TableOptions {
	/** Composite primary key, as a table-level constraint. */
	primaryKey?: string[];
	/** name -> indexed column expression, e.g. `{ idx_score_pp: 'pp DESC' }`. */
	indexes?: Record<string, string>;
}

export class Table<C extends Columns> {
	readonly primaryKeys: string[];
	readonly autoKey?: string;

	constructor(
		readonly name: string,
		readonly columns: C,
		readonly options: TableOptions = {},
	) {
		this.primaryKeys = options.primaryKey
			?? Object.keys(columns).filter(k => columns[k].isPrimaryKey);
		this.autoKey = Object.keys(columns).find(k => columns[k].isAutoincrement);
	}

	/** `CREATE TABLE IF NOT EXISTS` plus any index statements. */
	ddl(): string {
		const lines = Object.entries(this.columns).map(([name, c]) => {
			// NOT NULL by default; primary-key columns are implicitly not-null already.
			const notNull = c.isNullable || c.isPrimaryKey ? '' : ' NOT NULL';
			return `  ${name} ${c.sqlType}${notNull}${c.modifiers}`;
		});
		if (this.options.primaryKey?.length)
			lines.push(`  PRIMARY KEY (${this.options.primaryKey.join(', ')})`);

		const statements = [
			`CREATE TABLE IF NOT EXISTS ${this.name} (\n${lines.join(',\n')}\n);`,
		];
		for (const [name, expr] of Object.entries(this.options.indexes ?? {})) {
			statements.push(`CREATE INDEX IF NOT EXISTS ${name} ON ${this.name}(${expr});`);
		}
		return statements.join('\n');
	}

	/**
	 * Insert a row (omitting undefined columns) and return its rowid. Uses
	 * `INSERT OR REPLACE`, so a primary-key/unique conflict overwrites the
	 * existing row instead of throwing - primary keys stay as uniqueness +
	 * index, without blowing up on a deliberate overwrite.
	 */
	insert(db: Database, value: Insert<C>): number {
		const row = value as Record<string, unknown>;
		const keys = Object.keys(this.columns).filter(k => row[k] !== undefined);
		db.run(
			`INSERT OR REPLACE INTO ${this.name} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
			keys.map(k => this.columns[k].encode(row[k])),
		);
		return db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number;
	}

	/** {@link insert} for many rows in one write: each set of columns is prepared once.
	 *  Free it before the write ends (a save frees every statement). */
	inserter(db: Database) {
		const stmts = new Map<string, Statement>();
		const rowid = db.prepare('SELECT last_insert_rowid()');
		return {
			insert: (value: Insert<C>): number => {
				const row = value as Record<string, unknown>;
				const keys = Object.keys(this.columns).filter(k => row[k] !== undefined);
				const cols = keys.join(', ');
				let stmt = stmts.get(cols);
				if (!stmt) {
					stmt = db.prepare(`INSERT OR REPLACE INTO ${this.name} (${cols})
						VALUES (${keys.map(() => '?').join(', ')})`);
					stmts.set(cols, stmt);
				}
				stmt.run(keys.map(k => this.columns[k].encode(row[k])));
				rowid.step();
				const id = rowid.get()[0] as number;
				rowid.reset();
				return id;
			},
			free: () => {
				for (const stmt of stmts.values()) stmt.free();
				rowid.free();
			},
		};
	}

	/** Decode a raw sql.js row object into a typed row. */
	decode(raw: Record<string, SqlValue>): Row<C> {
		const out: Record<string, unknown> = {};
		for (const k in this.columns) out[k] = this.columns[k].decode(raw[k]);
		return out as Row<C>;
	}

	/** Run a query that returns rows of this table and decode them. */
	select(db: Database, sql: string, params: SqlValue[] = []): Row<C>[] {
		const stmt = db.prepare(sql);
		stmt.bind(params);
		const out: Row<C>[] = [];
		while (stmt.step()) out.push(this.decode(stmt.getAsObject()));
		stmt.free();
		return out;
	}

	/** Encode the primary-key value(s) of a row into bound parameters. */
	keyParams(key: SqlValue | Partial<Row<C>>): SqlValue[] {
		if (key !== null && typeof key === 'object') {
			return this.primaryKeys.map(k => this.columns[k].encode((key as any)[k]));
		}
		return [this.columns[this.primaryKeys[0]].encode(key)];
	}

	/** `col = ? AND …` clause over the primary-key columns. */
	keyWhere(): string {
		return this.primaryKeys.map(k => `${k} = ?`).join(' AND ');
	}
}

const registry: Table<any>[] = [];

/** Declare a table. Registers its schema so the managed connection creates it on boot. */
export const table = <C extends Columns>(
	name: string,
	columns: C, 
	options?: TableOptions,
): Table<C> => {
	const t = new Table(name, columns, options);
	registry.push(t);
	return t;
};

// ---- managed connection --------------------------------------------------
//
// sql.js runs in memory, so the database is persisted to IndexedDB as a byte
// blob after every write and restored on boot. None of this needs touching
// when tables are added - new schemas register themselves via table().

// resolves on commit, not on the put's success: a reload in between drops it.
// strict: the blob is on disk before the commit points at it, so a power cut
// keeps the previous save instead of leaving an unreadable one
async function idbWrite(op: (store: IDBObjectStore) => void): Promise<void> {
	const tx = (await openSave(SAVE_DB, true))
		.transaction(SAVE_STORE, 'readwrite', { durability: 'strict' });
	op(tx.objectStore(SAVE_STORE));
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = tx.onabort = () => reject(tx.error);
	});
}

const idbSave = (bytes: Uint8Array) => idbWrite(store => store.put(bytes, SAVE_KEY));

// saves run one after another, so an older snapshot never lands last
let saving: Promise<void> = Promise.resolve();
// once the save is thrown away, nothing may write the old database back before the reload
let discarded = false;

/**
 * A save copies the whole database: writes in a burst (a play's score, its bests, the
 * character) are saved once, this long after the first, instead of each one by itself.
 * Kept short, since a page that closes in between keeps only what was saved (the desktop
 * window waits for it).
 */
const SAVE_DELAY_MS = 250;
let due: ReturnType<typeof setTimeout> | undefined;
let written: Database | undefined;

/** Save the database as it is now, after any save already running. */
const saveNow = (): Promise<void> => {
	clearTimeout(due);
	due = undefined;
	if (!written) return saving;
	const bytes = written.export();
	saving = saving
		.then(() => idbSave(bytes))
		.catch(e => console.warn('[dao] failed to persist database', e));
	return saving;
};

// closing the window leaves no second to wait
window.addEventListener('pagehide', () => { if (due) void saveNow(); });

const getDatabaseSchema = (db: Database) => {
	const schema: any = {
		tables: [],
		views: [],
	};

	const queryToObjects = (sqlString: string) => {
		try {
			const res = db.exec(sqlString);
			if (!res || res.length === 0 || !res[0].values) return [];
            
			const { columns, values } = res[0];
			return values.map(row => {
				return columns.reduce((obj, colName, index) => {
					obj[colName] = row[index];
					return obj;
				}, {} as any);
			});
		} catch (err) {
			console.error(`Error executing query: ${sqlString}`, err);
			return [];
		}
	};

	// 1. Get all tables and views from the master catalog (excluding system tables)
	const masterItems = queryToObjects(`
        SELECT name, type, tbl_name, sql 
        FROM sqlite_master 
        WHERE name NOT LIKE 'sqlite_%' AND (type = 'table' OR type = 'view')
    `);

	for (const item of masterItems) {
		if (item.type === 'view') {
			schema.views.push({
				name: item.name,
				sql: item.sql,
			});
			continue;
		}

		// 2. Fetch column definitions for the table using PRAGMA table_info
		// Safely escaping table names using double quotes
		const columnsInfo = queryToObjects(`PRAGMA table_info("${item.name}")`);
        
		const columns = columnsInfo.map(col => ({
			name: col.name,
			type: col.type,
			notNull: col.notnull === 1,
			defaultValue: col.dflt_value,
			isPrimaryKey: col.pk > 0,
			primaryKeyOrder: col.pk, // Handles composite primary keys (1, 2, etc.)
		}));

		// 3. Fetch foreign keys for the table
		const fkInfo = queryToObjects(`PRAGMA foreign_key_list("${item.name}")`);
		const foreignKeys = fkInfo.map(fk => ({
			id: fk.id,
			seq: fk.seq,
			table: fk.table,
			from: fk.from,
			to: fk.to,
			onUpdate: fk.on_update,
			onDelete: fk.on_delete,
		}));

		// 4. Fetch indexes for the table
		const indexList = queryToObjects(`PRAGMA index_list("${item.name}")`);
		const indexes = [];

		for (const idx of indexList) {
			// Get columns involved in this specific index
			const idxInfo = queryToObjects(`PRAGMA index_info("${idx.name}")`);
			const indexedColumns = idxInfo.map(c => c.name);

			indexes.push({
				name: idx.name,
				unique: idx.unique === 1,
				origin: idx.origin, // 'c' for CREATE INDEX, 'u' for UNIQUE constraint
				columns: indexedColumns,
			});
		}
		
		const tableData = queryToObjects(`SELECT * FROM "${item.name}"`);

		// Append the fully realized table blueprint to our schema
		schema.tables.push({
			name: item.name,
			rawSql: item.sql,
			columns: columns,
			foreignKeys: foreignKeys,
			indexes: indexes,
			data: tableData,
		});
	}

	return schema;
};

let connection: Promise<Database> | undefined;

async function connect(): Promise<Database> {
	const SQL = await initSqlJs({ locateFile: () => wasmUrl });
	const current = await readSave(SAVE_DB);
	const legacy = current ? undefined : await readSave(LEGACY_SAVE_DB);
	const saved = current ?? legacy;
	const db = saved ? new SQL.Database(saved) : new SQL.Database();
	try {
		for (const t of registry) db.run(t.ddl());
		if (!saved) markMigrated(db);
		if (migrate(db)) await idbSave(db.export());
	} catch(e) {
		console.error(e);
		if (migrate(db)) await idbSave(db.export());
		for (const t of registry) db.run(t.ddl());
	}
	if (legacy) {
		await idbSave(db.export());
		indexedDB.deleteDatabase(LEGACY_SAVE_DB);
	}
	// if (debugMode.get()) {
	(window as any).db = {
		...DB,
		write: <T>(fn: (db: Database) => T) => DB.write(fn)
			.finally(() => addonWrites.set(addonWrites.get() + 1)),
	};
	console.log(getDatabaseSchema(db));
	(window as any).showDb = () => console.log(getDatabaseSchema(db));
	// }
	return db;
}

/** Bumped by writes through `window.db`, the handle add-ons write the game's tables with. */
export const addonWrites = new Synced(0);

/** The lazily-opened, schema-initialised database handle. A failed open is not
 *  kept: held, its rejection would be the answer to every later call for the
 *  rest of the session, and everything reading the database would go quiet at
 *  once. */
const handle = (): Promise<Database> => (connection ??= connect().catch(e => {
	connection = undefined;
	throw e;
}));

/**
 * The single managed database. Opens lazily, creates registered schemas on
 * first use, and persists writes to IndexedDB. No handle to pass around.
 */
export const DB = {
	/** Typed select against a table. */
	async select<C extends Columns>(
		t: Table<C>, 
		sql: string, 
		params: SqlValue[] = [],
	): Promise<Row<C>[]> {
		return t.select(await handle(), sql, params);
	},

	/** Typed select returning the first row, or undefined. */
	async first<C extends Columns>(
		t: Table<C>, 
		sql: string, 
		params: SqlValue[] = [],
	): Promise<Row<C> | undefined> {
		return (await this.select(t, sql, params))[0] ?? undefined;
	},

	/** Run a raw write statement and persist. */
	async run(sql: string, params: SqlValue[] = []): Promise<void> {
		await this.write(db => db.run(sql, params));
	},
	/** Read transaction: the callback gets the raw handle. */
	async read<T>(fn: (db: Database) => T): Promise<T> {
		return fn(await handle());
	},
	/** Write transaction: run several statements; the save follows (see SAVE_DELAY_MS). */
	async write<T>(fn: (db: Database) => T): Promise<T> {
		const db = await handle();
		const result = fn(db);
		if (discarded) return result;
		written = db;
		due ??= setTimeout(() => void saveNow(), SAVE_DELAY_MS);
		return result;
	},
	/** Resolves once every write made so far is on disk; one waiting to be saved is saved now. */
	saved: (): Promise<void> => (due ? saveNow() : saving),
	/** Deletes the save: the next boot builds a fresh database, as for a new player. */
	async discard(): Promise<void> {
		discarded = true;
		clearTimeout(due);
		due = undefined;
		await saving;
		await idbWrite(store => store.delete(SAVE_KEY));
	},
};

// ---- active-record base --------------------------------------------------

interface DaoInstance<C extends Columns> {
	/** Insert this row, replacing any existing row with the same key. Fills in the autoincrement key, then returns itself. */
	add(): Promise<this>;
	/** Persist the instance's current field values to its row. */
	update(patch?: Partial<Row<C>>): Promise<this>;
	/** Delete this row by primary key. */
	delete(): Promise<void>;
}

type Record_<C extends Columns> = DaoInstance<C> & Row<C>;

export interface DaoStatic<C extends Columns> {
	new (row: Insert<C>): Record_<C>;
	readonly table: Table<C>;

	get<T extends DaoStatic<C>>(
		this: T, 
		key: SqlValue | Partial<Row<C>>
	): Promise<InstanceType<T> | undefined>;

	getAll<T extends DaoStatic<C>>(this: T): Promise<InstanceType<T>[]>;

	query<T extends DaoStatic<C>>(
		this: T, 
		sql: string, 
		params?: SqlValue[]
	): Promise<InstanceType<T>[]>;

	first<T extends DaoStatic<C>>(
		this: T, 
		sql: string, 
		params?: SqlValue[]
	): Promise<InstanceType<T> | undefined>;
}

/**
 * Build an active-record base class for a table. `class X extends DAO(t)` gives
 * X instances typed with the row columns plus add/update/delete, and static
 * get/getAll/query/first - all typed as X. The global {@link DB} stays
 * reachable for anything bespoke.
 */
export function DAO<C extends Columns>(t: Table<C>): DaoStatic<C> {
	class Model {
		// internally we build from decoded rows (Row); the public `new (row: Insert)`
		// contract is enforced by the DaoStatic cast below.
		constructor(row: Row<C>) {
			Object.assign(this, row);
			// fill in column defaults the caller omitted, so a freshly-built
			// instance matches what the DB would store.
			for (const k in t.columns) {
				const col = t.columns[k];
				if (col.hasDefault && (this as any)[k] === undefined)
					(this as any)[k] = col.defaultValue;
			}
		}

		async add(): Promise<this> {
			const id = await DB.write(db => t.insert(db, this as unknown as Insert<C>));
			if (t.autoKey) (this as any)[t.autoKey] = id;
			return this;
		}

		async update(patch?: Partial<Row<C>>): Promise<this> {
			if (patch) Object.assign(this, patch);
			const cols = Object.keys(t.columns)
				.filter(k => !t.primaryKeys.includes(k) && (this as any)[k] !== undefined);
			const set = cols.map(k => `${k} = ?`).join(', ');
			const params = [
				...cols.map(k => t.columns[k].encode((this as any)[k])),
				...t.keyParams(this as any),
			];
			await DB.run(`UPDATE ${t.name} SET ${set} WHERE ${t.keyWhere()}`, params);
			return this;
		}

		async delete(): Promise<void> {
			await DB.run(
				`DELETE FROM ${t.name} WHERE ${t.keyWhere()}`
				, t.keyParams(this as any));
		}

		static table = t;

		static async get(key: SqlValue | Partial<Row<C>>) {
			const row = await DB.first(t, 
				`SELECT * FROM ${t.name} WHERE ${t.keyWhere()}`
				, t.keyParams(key));
			return row ? new this(row) : undefined;
		}

		static async getAll() {
			const rows = await DB.select(t, `SELECT * FROM ${t.name}`);
			return rows.map(r => new this(r));
		}

		static async query(sql: string, params: SqlValue[] = []) {
			const rows = await DB.select(t, sql, params);
			return rows.map(r => new this(r));
		}

		static async first(sql: string, params: SqlValue[] = []) {
			const row = await DB.first(t, sql, params);
			return row ? new this(row) : undefined;
		}
	}

	return Model as unknown as DaoStatic<C>;
}
