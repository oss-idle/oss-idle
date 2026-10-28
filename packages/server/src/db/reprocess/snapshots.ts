/**
 * The 4K progress every prod dump held, as SQL for the score reprocessor: per dump
 * its highest score id, each character's skills and fatigue, and the memory plays
 * that moved since the dump before it. Dumps go in the order they were taken.
 *
 * Fatigue counts from the dump named by --fatigue-from on: the column came a release
 * before plays were tired (1.2.1.0, then 1.2.2.0 played with it).
 *
 *   tsx src/db/reprocess/snapshots.ts --fatigue-from idle-1.2.2.0 a.sql b.sql.gz c.sql.zst \
 *     | gzip > snapshots.sql.gz
 */
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';

import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';
import { xpToLevel } from '@oss-idle/shared/xp';

type Row = (string | undefined)[];

const BATCH = 2000;

const ESCAPES: Record<string, string> = {
	0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a',
};

/** A quoted value starting at `i`: the text, and where the value after it starts. */
const quoted = (line: string, i: number): [string, number] => {
	let s = '';
	for (i++; line[i] !== '\''; i++) {
		if (line[i] === '\\') s += ESCAPES[line[++i]] ?? line[i];
		else s += line[i];
	}
	return [s, i + 1];
};

/** A bare value starting at `i` (a number, NULL): undefined for NULL. */
const bare = (line: string, i: number): [string | undefined, number] => {
	let j = i;
	while (j < line.length && line[j] !== ',' && line[j] !== ')') j++;
	const token = line.slice(i, j);
	return [token === 'NULL' ? undefined : token, j];
};

/** The tuples of a mysqldump INSERT line from `from` on: raw strings, undefined for NULL. */
export const tuples = (line: string, from: number): Row[] => {
	const rows: Row[] = [];
	let row: Row = [];
	for (let i = from; i < line.length && line[i] !== ';';) {
		const c = line[i];
		if (c === '(') row = [];
		else if (c === ')') rows.push(row);
		if ('(), '.includes(c)) {
			i++;
			continue;
		}
		const [value, next] = c === '\'' ? quoted(line, i) : bare(line, i);
		row.push(value);
		i = next;
	}
	return rows;
};

/** A row's value by column name, undefined for a column the dump's table lacks. */
type Field = (row: Row, column: string) => string | undefined;
const fieldsOf = (columns: string[]): Field => (row, column) => {
	const i = columns.indexOf(column);
	return i === -1 ? undefined : row[i];
};

/** Everything a skill ever earned. Early dumps have no lifetime xp, or zeros before it
 *  was backfilled, and none had totals at first: each is a floor of it. */
const lifetimeOf = (field: (name: string) => string | undefined, level: number, xp: number) =>
	Math.max(
		Number(field('lifetime_xp') ?? 0),
		Number(field('total_xp') ?? 0),
		Math.floor(xpToLevel(level)) + xp,
	);

const SKILL_COLUMNS = ['level', 'xp', 'upgrades', 'overdrive', 'prestige'];

/** A skill's level, xp, upgrades, overdrive, prestige and lifetime xp. */
const skillOf = (row: Row, field: Field, skill: string) => {
	const of = (name: string) => field(row, `${skill}_${name}`);
	const [level, xp, upgrades, overdrive, prestige] = SKILL_COLUMNS.map(name => Number(of(name) ?? 0));
	return [level, xp, upgrades, overdrive, prestige, lifetimeOf(of, level, xp)];
};

const quote = (s: string | undefined) =>
	s === undefined ? 'NULL' : `'${s.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;

const out = (s: string) => process.stdout.write(`${s}\n`);

const inserts = (table: string, columns: string, values: string[]) => {
	for (let i = 0; i < values.length; i += BATCH) {
		out(`INSERT INTO ${table} (${columns}) VALUES ${values.slice(i, i + BATCH).join(',')};`);
	}
};

const SCORES = ['score', 'mania4k_score'];
const PROFILES = ['character', 'mania4k_character'];
const PLAYED = ['beatmaps_played', 'mania4k_beatmaps_played'];

const reader = (file: string) => {
	const tool = file.endsWith('.gz') ? 'zcat' : file.endsWith('.zst') ? 'zstdcat' : 'cat';
	const unpack = spawn('nice', ['-n', '19', tool, file], { stdio: ['ignore', 'pipe', 'inherit'] });
	// only the lines that matter reach node, a dump being mostly charts and scores: the
	// table definitions and the targets' inserts, whose rows may each take a line
	const targets = [...SCORES, ...PROFILES, ...PLAYED].join('|');
	const keep = `/^CREATE TABLE|^  \`/ { print; next } /^INSERT INTO \`(${targets})\` / { f = 1 } f { print } /;$/ { f = 0 }`;
	const awk = spawn('nice', ['-n', '19', 'awk', keep], { stdio: [unpack.stdout, 'pipe', 'inherit'] });
	return createInterface({
		input: awk.stdout, crlfDelay: Infinity,
	});
};

type Profile = { id: number, skills: Record<string, number[]>, fatigue?: string };

/** What one dump holds: its highest 4K score id, its profiles, and its memory plays by `character:beatmap`. */
class Dump {
	maxScoreId = 0;
	readonly profiles: Profile[] = [];
	readonly memory = new Map<string, number>();
	hasFatigue = false;

	/** Take the rows of one INSERT line of `table`. */
	take(table: string, columns: string[], line: string, from: number) {
		if (SCORES.includes(table)) this.scores(line);
		// the shared character table held the skills until the rulesets split
		else if (PROFILES.includes(table)) {
			if (columns.includes('accuracy_level')) this.characters(columns, line, from);
		}
		else if (PLAYED.includes(table)) this.played(columns, line, from);
	}

	/** Rows come in id order: a line's last tuple holds its highest. */
	private scores(line: string) {
		const last = Number.parseInt(line.slice(line.lastIndexOf('(') + 1), 10);
		this.maxScoreId = Math.max(this.maxScoreId, last || 0);
	}

	private characters(columns: string[], line: string, from: number) {
		const field = fieldsOf(columns);
		this.hasFatigue = columns.includes('fatigue');
		for (const row of tuples(line, from)) this.profiles.push({
			id: Number(field(row, 'id')),
			skills: Object.fromEntries(Skills.map(skill => [skill, skillOf(row, field, skill)])),
			fatigue: field(row, 'fatigue'),
		});
	}

	/** Memory plays, or every play before memory was forgotten apart. */
	private played(columns: string[], line: string, from: number) {
		const field = fieldsOf(columns);
		for (const row of tuples(line, from)) {
			const key = `${field(row, 'character_id')}:${field(row, 'beatmap_id')}`;
			this.memory.set(key, Number(field(row, 'memory') ?? field(row, 'plays')));
		}
	}
}

const name = (line: string) => /`([^`]+)`/.exec(line)![1];

const readDump = async (file: string) => {
	const dump = new Dump();
	const columns = new Map<string, string[]>();
	let creating: string[] | undefined;
	let inserting: string | undefined;
	for await (const line of reader(file)) {
		if (line.startsWith('CREATE TABLE')) {
			creating = [];
			columns.set(name(line), creating);
		} else if (line.startsWith('  `')) {
			creating?.push(name(line));
		} else {
			creating = undefined;
			const header = line.startsWith('INSERT INTO');
			if (header) inserting = name(line);
			dump.take(inserting!, columns.get(inserting!)!, line, header ? line.indexOf(' VALUES') + 7 : 0);
			if (line.endsWith(';')) inserting = undefined;
		}
	}
	return dump;
};

const TABLES = [
	'CREATE TABLE reprocess_snapshot (id int PRIMARY KEY, label varchar(255) NOT NULL, max_score_id int NOT NULL, fatigue bool NOT NULL);',
	'CREATE TABLE reprocess_profile (snapshot_id int NOT NULL, character_id int NOT NULL, skills text NOT NULL, fatigue text, PRIMARY KEY (character_id, snapshot_id));',
	'CREATE TABLE reprocess_memory (snapshot_id int NOT NULL, character_id int NOT NULL, beatmap_id int NOT NULL, memory double NOT NULL, PRIMARY KEY (character_id, beatmap_id, snapshot_id));',
];

const write = (id: number, file: string, dump: Dump, moved: [string, number][]) => {
	const label = quote(basename(file));
	const { maxScoreId, hasFatigue } = dump;
	out(`INSERT INTO reprocess_snapshot VALUES (${id}, ${label}, ${maxScoreId}, ${hasFatigue});`);
	inserts('reprocess_profile', 'snapshot_id, character_id, skills, fatigue', dump.profiles.map(p =>
		`(${id}, ${p.id}, ${quote(JSON.stringify(p.skills))}, ${quote(p.fatigue)})`));
	const memory = 'snapshot_id, character_id, beatmap_id, memory';
	inserts('reprocess_memory', memory, moved.map(([key, plays]) => {
		const [characterId, beatmapId] = key.split(':');
		return `(${id}, ${characterId}, ${beatmapId}, ${plays})`;
	}));
};

const main = async () => {
	out('DROP TABLE IF EXISTS reprocess_snapshot, reprocess_profile, reprocess_memory;');
	TABLES.forEach(out);
	const args = process.argv.slice(2);
	const at = args.indexOf('--fatigue-from');
	const fatigueFrom = at === -1 ? undefined : args.splice(at, 2)[1];
	let tired = fatigueFrom === undefined;
	let previous = new Dump();
	for (const [i, file] of args.entries()) {
		const dump = await readDump(file);
		tired ||= basename(file).startsWith(fatigueFrom!);
		dump.hasFatigue &&= tired;
		if (dump.maxScoreId < previous.maxScoreId) {
			// a rollback's dump, or one out of order: the plays it lost would fall in no window
			console.error(`${basename(file)}: skipped, its highest score ${dump.maxScoreId}`
				+ ' is below the one before');
			continue;
		}
		const moved = [...dump.memory].filter(([key, plays]) => previous.memory.get(key) !== plays);
		write(i + 1, file, dump, moved);
		previous = dump;
		console.error(`${basename(file)}: score ${dump.maxScoreId}, ${dump.profiles.length} profiles,`
			+ ` ${moved.length} memory moves${dump.hasFatigue ? ', fatigue' : ''}`);
	}
};

void main();
