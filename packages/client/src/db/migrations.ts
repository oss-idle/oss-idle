import type { Database } from 'sql.js';

import { GRADE } from '@oss-idle/shared/grade';
import { rankValueSQL } from '@oss-idle/shared/scoreOrder';
import {
	xpGivesLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

/**
 * Schema migrations, applied in order on boot.
 *
 * Versioning rides on SQLite's `PRAGMA user_version`: it records how many
 * migrations have run, so each one applies exactly once per database. A new
 * database is created from the live schema, so it starts past every migration.
 *
 * Each migration is a frozen snapshot: it embeds its own DDL rather than
 * referencing the live `table()` definitions, so editing a schema later never
 * silently changes what an old migration did.
 */
type Migration = (db: Database) => void;

/** `ALTER TABLE ... ADD COLUMN`, skipped when the column is already there: the
 *  live schema's tables are created before migrating, so they may hold it already. */
const hasColumn = (db: Database, table: string, column: string): boolean => !!db.exec(`
	SELECT EXISTS (
		SELECT 1 FROM pragma_table_info('${table}') WHERE name = '${column}'
	);
`)[0].values[0][0];

const addColumn = (db: Database, table: string, column: string, ddl: string) => {
	if (hasColumn(db, table, column)) return false;

	db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
	return true;
};

/**
 * Personal-best tables were keyed by score `id`, so a new best inserted a fresh
 * row and the old marker lingered - `best()` then returned an arbitrary (in
 * practice, the earliest/worst) one. Re-key them on `(characterId, beatmapId)`
 * and recompute every character's best score / best pp from scratch.
 */
const recomputeBests: Migration = db => {
	db.run('DROP TABLE IF EXISTS score_best');
	db.run('DROP TABLE IF EXISTS score_best_pp');

	db.run(`CREATE TABLE score_best (
		characterId INTEGER NOT NULL,
		beatmapId   INTEGER NOT NULL,
		scoreId     INTEGER NOT NULL,
		PRIMARY KEY (characterId, beatmapId)
	);`);
	db.run(`CREATE TABLE score_best_pp (
		characterId INTEGER NOT NULL,
		beatmapId   INTEGER NOT NULL,
		scoreId     INTEGER NOT NULL,
		PRIMARY KEY (characterId, beatmapId)
	);`);

	// For each (character, beatmap) keep the row that nothing else beats:
	// higher value wins, ties broken by the earlier (smaller) id.
	db.run(`INSERT INTO score_best (characterId, beatmapId, scoreId)
		SELECT s.characterId, s.beatmapId, s.id FROM score s
		WHERE NOT EXISTS (
			SELECT 1 FROM score o
			WHERE o.characterId = s.characterId AND o.beatmapId = s.beatmapId
				AND (o.score > s.score OR (o.score = s.score AND o.id < s.id))
		);`);
	db.run(`INSERT INTO score_best_pp (characterId, beatmapId, scoreId)
		SELECT s.characterId, s.beatmapId, s.id FROM score s
		WHERE NOT EXISTS (
			SELECT 1 FROM score o
			WHERE o.characterId = s.characterId AND o.beatmapId = s.beatmapId
				AND (o.pp > s.pp OR (o.pp = s.pp AND o.id < s.id))
		);`);
};

const addOnlineId: Migration = db => {
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1
			FROM pragma_table_info('score')
			WHERE name = 'onlineId'
		);
	`)[0].values[0][0] as number;

	if (exists) return;

	db.run('ALTER TABLE score ADD COLUMN onlineId INTEGER DEFAULT -1;');
	db.run('CREATE INDEX IF NOT EXISTS idx_score_online_id ON score(onlineId);');
};

const dedupeGuests: Migration = db => {
	const ids = db.exec(`
		SELECT * FROM character WHERE id != 1 AND name = 'Guest';
	`)[0]?.values?.map(c => c[0]);
	
	if (!ids || !ids.length) return;

	const keep = db.exec(
		'SELECT * FROM character WHERE name = \'Guest\' ORDER BY accuracy DESC',
	)[0]?.values[0][0];
	if (keep === undefined) return; // ignore
	if (keep !== 1) {
		db.run('DELETE FROM character WHERE id = 1');
		db.run('UPDATE character SET id = 1 WHERE id = ?', [keep]);
		db.run('UPDATE score SET characterId = 1 WHERE characterId = ?', [keep]);
		db.run('DELETE FROM score_best WHERE characterId = ?', [keep]);
		db.run('DELETE FROM score_best_pp WHERE characterId = ?', [keep]);
	}

	for (const id of ids) {
		if (id === keep) continue;
		db.run('UPDATE score SET characterId = 1 WHERE characterId = ?', [id]);
		db.run('DELETE FROM score_best WHERE characterId = ?', [id]);
		db.run('DELETE FROM score_best_pp WHERE characterId = ?', [id]);
		db.run('DELETE FROM character WHERE id = ?', [id]);
	}

	recomputeBests(db);
};

const removeScoreSetId: Migration = db => {
	// On a fresh database the live schema creates `score` without `setId`, so the
	// drop would fail with "no such column: setId". Only drop it if it's there.
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1
			FROM pragma_table_info('score')
			WHERE name = 'setId'
		);
	`)[0].values[0][0] as number;

	if (!exists) return;

	db.run('ALTER TABLE score DROP COLUMN setId');
};

const addAddonsGameVersion: Migration = db => {
	// The addon table only exists once the add-ons scene has run (the registry
	// creates it, with gameVersion, on boot). Patch only an older table that was
	// created before the column existed; backfill blanks.
	const tableExists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'addon'
		);
	`)[0].values[0][0] as number;
	if (!tableExists) return;

	const hasColumn = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM pragma_table_info('addon') WHERE name = 'gameVersion'
		);
	`)[0].values[0][0] as number;
	if (hasColumn) return;

	db.run('ALTER TABLE addon ADD COLUMN gameVersion TEXT NOT NULL DEFAULT \'\';');
};

const addSkillUpgrades: Migration = db => {
	// Fresh databases create `character` with these columns already; only patch
	// an older table. One probe column stands for the whole batch.
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM pragma_table_info('character') WHERE name = 'accuracyUpgrades'
		);
	`)[0].values[0][0] as number;
	if (exists) return;

	const skills = [
		'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release',
		'reading', 'consistency', 'concentration', 'speedjam', 'memory',
	];
	for (const skill of skills) {
		db.run(`ALTER TABLE character ADD COLUMN ${skill}Upgrades INTEGER DEFAULT 0;`);
		db.run(`ALTER TABLE character ADD COLUMN ${skill}Overdrive REAL DEFAULT 0;`);
	}
};

/** Prestige counters per skill, plus the character's rebirth generation. */
const addPrestige: Migration = db => {
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM pragma_table_info('character') WHERE name = 'accuracyPrestige'
		);
	`)[0].values[0][0] as number;
	if (exists) return;

	const skills = [
		'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release',
		'reading', 'consistency', 'concentration', 'speedjam', 'memory',
	];
	for (const skill of skills) {
		db.run(`ALTER TABLE character ADD COLUMN ${skill}Prestige INTEGER DEFAULT 0;`);
		db.run(`ALTER TABLE character ADD COLUMN ${skill}TotalXp INTEGER DEFAULT 0;`);
	}

	db.run('ALTER TABLE character ADD COLUMN overallTotalXp INTEGER DEFAULT 0;');
	db.run('ALTER TABLE character ADD COLUMN overallLevel INTEGER DEFAULT 0;');

	db.run('ALTER TABLE character ADD COLUMN generation INTEGER DEFAULT 1;');
	// The table also caches server characters for score assignment, so offline
	// ones need a marker of their own once a rebirth pushes them past id 1.
	db.run('ALTER TABLE character ADD COLUMN local INTEGER DEFAULT 0;');
	db.run('UPDATE character SET local = 1 WHERE id = 1;');
};

/** The divine judgement's own count column on stored scores. */
const addDivineJudgement: Migration = db => {
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM pragma_table_info('score') WHERE name = 'DIVINE'
		);
	`)[0].values[0][0] as number;
	if (exists) return;

	db.run('ALTER TABLE score ADD COLUMN DIVINE INTEGER DEFAULT 0;');
};

/** The top grade was renamed while it was dev-only, so stored scores still say
 *  the old letter. */
const renameGradeZ: Migration = db => {
	db.run(`UPDATE score SET grade = '${GRADE.XX}' WHERE grade = 'Z';`);
};

/** `addPrestige` added the lifetime totals with a default of 0 and left them
 *  there, but the row already held the player's whole history in its level/xp
 *  columns. Rebirth reads `overallLevel`, so every existing player was back at
 *  overall Lv0. */
const backfillTotals: Migration = db => {
	const skills = [
		'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release',
		'reading', 'consistency', 'concentration', 'speedjam', 'memory',
	];
	const cols = skills.flatMap(s => [s, `${s}XP`, `${s}TotalXp`]);
	const rows = db.exec(`SELECT id, ${cols.join(', ')} FROM character`)[0];
	if (!rows) return;

	for (const row of rows.values as number[][]) {
		const id = row[0];
		let overall = 0;
		const sets: string[] = [];
		skills.forEach((skill, i) => {
			const [level, xp, total] = row.slice(1 + i * 3, 4 + i * 3);
			const lifetime = total || Math.round(xpToLevel(level) + xp);
			overall += lifetime;
			sets.push(`${skill}TotalXp = ${lifetime}`);
		});
		const level = xpGivesLevel(overall).level;
		db.run(`UPDATE character
			SET ${sets.join(', ')}, overallTotalXp = ${overall}, overallLevel = ${level}
			WHERE id = ${id};`);
	}
};

/** Local characters used to be id 1 alone, so a rebirth's autoincrement id could
 *  land on a server character's id and the two rows would overwrite each other.
 *  Move the whole local lineage below zero, where server ids never reach. */
const localCharacterIds: Migration = db => {
	const exists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM pragma_table_info('character') WHERE name = 'current'
		);
	`)[0].values[0][0] as number;
	if (!exists) db.run('ALTER TABLE character ADD COLUMN current INTEGER DEFAULT 0;');

	// score_xp only exists once its module has been imported, so check first
	const has = (name: string) =>
		db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '${name}';`).length > 0;

	const locals = 'SELECT id FROM character WHERE local = 1 AND id > 0';
	for (const t of ['score', 'score_best', 'score_best_pp', 'score_xp'])
		if (has(t)) db.run(`UPDATE ${t} SET characterId = -characterId WHERE characterId IN (${locals});`);
	db.run('UPDATE character SET id = -id WHERE local = 1 AND id > 0;');

	db.run(`UPDATE character SET current = 1 WHERE id =
		(SELECT id FROM character WHERE local = 1 ORDER BY generation DESC LIMIT 1);`);
};

/** Re-pick the local bests through the shared ordering rule. Score alone used
 *  to decide it, so a divine play - capped at 1M like any other - never
 *  displaced the score already there and the card kept the older grade. */
const rebestOnAccuracy: Migration = db => {
	db.run('DELETE FROM score_best');
	db.run(`INSERT INTO score_best (characterId, beatmapId, scoreId)
		SELECT s.characterId, s.beatmapId, s.id FROM score s
		WHERE NOT EXISTS (
			SELECT 1 FROM score o
			WHERE o.characterId = s.characterId AND o.beatmapId = s.beatmapId
				AND (${rankValueSQL('o.')} > ${rankValueSQL('s.')}
					OR (${rankValueSQL('o.')} = ${rankValueSQL('s.')} AND o.id < s.id))
		);`);
};


/** Lifetime xp, the figure spending never takes back. Existing rows only have
 *  the spendable total, which is the closest thing they ever recorded. */
const addLifetimeXp: Migration = db => {
	const skills = [
		'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release',
		'reading', 'consistency', 'concentration', 'speedjam', 'memory',
	];
	for (const skill of skills) {
		if (!addColumn(db, 'character', `${skill}LifetimeXp`, 'INTEGER DEFAULT 0')) continue;
		db.run(`UPDATE character SET ${skill}LifetimeXp = ${skill}TotalXp;`);
	}
};

/** Memory's prestige forgets the maps it learned. Existing rows keep all their
 *  training: nothing has been prestiged yet at this point. */
const addMemoryReset: Migration = db => {
	addColumn(db, 'character', 'memoryResetAt', 'INTEGER DEFAULT 0');
};

/** Memory upgrades forget plays on every map: a guest records when, as its
 *  play counts are read back off its scores. The ones already bought forget now. */
const addMemoryForget: Migration = db => {
	if (!addColumn(db, 'character', 'memoryForgetAt', 'TEXT NOT NULL DEFAULT \'[]\'')) return;
	const now = Date.now();
	const rows = db.exec('SELECT id, memoryUpgrades FROM character WHERE memoryUpgrades > 0;');
	for (const [id, upgrades] of rows[0]?.values ?? []) {
		db.run('UPDATE character SET memoryForgetAt = ? WHERE id = ?;',
			[JSON.stringify(Array<number>(upgrades as number).fill(now)), id]);
	}
};

const addScoreRate: Migration = db => {
	addColumn(db, 'score', 'rate', 'REAL DEFAULT 1');
};

const addScoreMods: Migration = db => {
	addColumn(db, 'score', 'mods', 'TEXT DEFAULT \'\'');
};

/** What an installed add-on is for (gameplay, editor), as its listing says. */
const addAddonTypes: Migration = db => {
	// the editor's test builds ran this in addMemoryForget's place
	addMemoryForget(db);
	const tableExists = db.exec(`
		SELECT EXISTS (
			SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'addon'
		);
	`)[0].values[0][0] as number;
	if (tableExists) addColumn(db, 'addon', 'types', 'TEXT NOT NULL DEFAULT \'gameplay\'');
};

/** A playlist holds a difficulty once per rate it is locked at, and once
 *  unlocked (rate 0, following the mod): the rate joins the key. */
const playlistEntryRate: Migration = db => {
	if (hasColumn(db, 'playlist_entry', 'rate')) return;
	db.run('ALTER TABLE playlist_entry RENAME TO playlist_entry_old;');
	db.run('DROP INDEX IF EXISTS idx_playlist_entry_beatmap;');
	db.run(`CREATE TABLE playlist_entry (
		playlistId INTEGER NOT NULL,
		beatmapId  INTEGER NOT NULL,
		rate       REAL NOT NULL DEFAULT 0,
		PRIMARY KEY (playlistId, beatmapId, rate)
	);`);
	db.run('CREATE INDEX idx_playlist_entry_beatmap ON playlist_entry(beatmapId);');
	db.run(`INSERT INTO playlist_entry (playlistId, beatmapId)
		SELECT playlistId, beatmapId FROM playlist_entry_old;`);
	db.run('DROP TABLE playlist_entry_old;');
};

/** Playlists play in their own order, and a map can sit in one more than
 *  once, each copy with how many times it plays in a row. */
const playlistEntryOrder: Migration = db => {
	if (hasColumn(db, 'playlist_entry', 'position')) return;
	db.run('ALTER TABLE playlist_entry RENAME TO playlist_entry_old;');
	db.run('DROP INDEX IF EXISTS idx_playlist_entry_beatmap;');
	db.run(`CREATE TABLE playlist_entry (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		playlistId INTEGER NOT NULL,
		beatmapId  INTEGER NOT NULL,
		rate       REAL NOT NULL DEFAULT 0,
		position   INTEGER NOT NULL,
		repeat     INTEGER NOT NULL DEFAULT 1
	);`);
	db.run('CREATE INDEX idx_playlist_entry_beatmap ON playlist_entry(beatmapId);');
	db.run(`INSERT INTO playlist_entry (playlistId, beatmapId, rate, position)
		SELECT playlistId, beatmapId, rate, rowid FROM playlist_entry_old;`);
	db.run('DROP TABLE playlist_entry_old;');
};

/** A play's xp per skill as one JSON column, whatever the ruleset's skills: the 4K
 *  columns are read into it once and left unread. */
const scoreXpGains: Migration = db => {
	const table = 'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = \'score_xp\';';
	if (!db.exec(table).length) return;
	addColumn(db, 'score_xp', 'gains', 'TEXT DEFAULT \'{}\'');
	const skills = [
		'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release',
		'reading', 'consistency', 'concentration', 'speedjam', 'memory',
	].filter(skill => hasColumn(db, 'score_xp', skill));
	if (!skills.length) return;
	const rows = db.exec(`SELECT scoreId, ${skills.join(', ')} FROM score_xp;`)[0]?.values ?? [];
	for (const [scoreId, ...gained] of rows) {
		const gains = Object.fromEntries(skills
			.map((skill, i) => [skill, Number(gained[i] ?? 0)])
			.filter(([, xp]) => (xp as number) > 0));
		db.run('UPDATE score_xp SET gains = ? WHERE scoreId = ?;', [JSON.stringify(gains), scoreId]);
	}
};

/** Skins are osu! skins now, their files kept in IndexedDB: the old JSON ones go. */
const osuSkins: Migration = db => {
	if (!hasColumn(db, 'skin', 'definition')) return;
	db.run('DELETE FROM skin;');
	db.run('ALTER TABLE skin DROP COLUMN definition;');
};

/** A playlist lock holds the mods picked with its rate. */
const playlistEntryMods: Migration = db => {
	addColumn(db, 'playlist_entry', 'mods', 'TEXT NOT NULL DEFAULT \'\'');
};

/** An installed add-on can take its updates as soon as they are published. */
const addAddonAutoUpdate: Migration = db => {
	const table = 'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = \'addon\';';
	if (db.exec(table).length) addColumn(db, 'addon', 'autoUpdate', 'INTEGER NOT NULL DEFAULT 0');
};

/** 7K's chords skill became jacks while dev-only: its local columns follow. A
 *  fresh database already has the jacks columns. */
const rename7kJacks: Migration = db => {
	for (const field of ['', 'XP', 'Upgrades', 'Overdrive', 'Prestige', 'TotalXp', 'LifetimeXp']) {
		if (!hasColumn(db, 'character_mania7k', `chords${field}`)) continue;
		db.run(`ALTER TABLE character_mania7k RENAME COLUMN chords${field} TO jacks${field};`);
	}
};

/** Playlists belong to a character: the existing ones go to the first that reads them. */
const playlistCharacter: Migration = db => {
	const table = 'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = \'playlist\';';
	if (db.exec(table).length) addColumn(db, 'playlist', 'characterId', 'INTEGER NOT NULL DEFAULT 0');
};

/** A local character's genetic and genes. */
const addGenetics: Migration = db => {
	const tables = db.exec(
		'SELECT name FROM sqlite_master WHERE type = \'table\' AND name LIKE \'character%\'',
	);
	for (const [name] of tables[0]?.values ?? []) {
		if (name === 'character' || String(name).startsWith('character_')) {
			addColumn(db, String(name), 'geneticsJson', 'TEXT NOT NULL DEFAULT \'\'');
		}
	}
};

const migrations: Migration[] = [
	recomputeBests,
	addOnlineId,
	dedupeGuests,
	removeScoreSetId,
	addAddonsGameVersion,
	addSkillUpgrades,
	addPrestige,
	addDivineJudgement,
	backfillTotals,
	localCharacterIds,
	renameGradeZ,
	rebestOnAccuracy,
	addLifetimeXp,
	addMemoryReset,
	addScoreRate,
	playlistEntryRate,
	addScoreMods,
	addMemoryForget,
	addAddonTypes,
	playlistEntryOrder,
	osuSkins,
	scoreXpGains,
	playlistEntryMods,
	addAddonAutoUpdate,
	rename7kJacks,
	playlistCharacter,
	addGenetics,
];

/** A database just created from the live schema already is what every migration makes. */
export function markMigrated(db: Database): void {
	db.run(`PRAGMA user_version = ${migrations.length}`);
}

/**
 * Apply every migration not yet recorded in `user_version`, then bump it.
 * Returns true if any migration ran, so the caller can persist the result.
 */
export function migrate(db: Database): boolean {
	const version = db.exec('PRAGMA user_version')[0].values[0][0] as number;
	console.log(`Current DB version v${version}`);
	for (let v = version; v < migrations.length; v++) {
		console.log(`Migrating db to v${v+1}...`);
		migrations[v](db);
		db.run(`PRAGMA user_version = ${v+1}`);
		console.log(`DB version v${v+1}`);
	}
	return version < migrations.length;
}
