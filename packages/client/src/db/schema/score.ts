import type { Database } from 'sql.js';

import { Grade } from '@oss-idle/shared/grade';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	type Mod,
	modsKey,
	parseMods,
} from '@oss-idle/shared/mods';
import type { BoardSort } from '@oss-idle/shared/rankings';
import {
	Judgement,
	Judgements,
} from '@oss-idle/shared/rulesets/mania/judgement';
import { recall } from '@oss-idle/shared/rulesets/mania/memoryRecall';
import { ScoreDTO } from '@oss-idle/shared/score';
import {
	betterScore,
	rankValueSQL,
} from '@oss-idle/shared/scoreOrder';

import {
	boolean,
	Column,
	DAO,
	DB,
	type Insert,
	integer,
	real,
	table,
	text,
} from '../dao';
import { MemoryFail } from './memory_fail';
import { ScoreBest } from './score_best';
import { ScoreBestPP } from './score_best_pp';
import {
	ScoreXP,
	xpGainsChanged,
} from './score_xp';

const judgementColumns = Object.fromEntries(
	Judgements.map(j => [j, integer()]),
) as Record<Judgement, Column<number>>;

const t = table('score', {
	id:          integer().primaryKey().autoincrement(),
	onlineId:    integer().default(-1),
	// a server copy of a play on an unranked map's board: its onlineId counts in its own table
	unranked:    boolean().default(false),
	characterId: integer(),
	beatmapId:   integer(),
	score:       integer(),
	accuracy:    real(),
	maxCombo:    integer(),
	...judgementColumns,
	grade:       text<Grade>(),
	pp:          real(),
	ur:          real(),
	pfc:         boolean(),
	playedAt:    integer(),
	rate:        real().default(1),
	mods:        new Column<Mod[]>('TEXT', modsKey, v => parseMods(String(v ?? ''))).default([]),
}, {
	indexes: {
		idx_score_online_id: 'onlineId',
		idx_score_beatmap:   'beatmapId',
		idx_score_character: 'characterId',
		// a card's best on its map: with one character, the character index alone reads every play
		idx_score_character_map: 'characterId, beatmapId',
		idx_score_value:     'score DESC',
		idx_score_pp:        'pp DESC',
	},
});

/** Bumped on every score write so live views re-query
 *  instead of holding a stale best - e.g. a global leaderboard load that imports
 *  one of the live character's scores. */
export const scoresVersion = new Synced<ScoresChange>({ n: 0 });

/** A change to the stored scores: `beatmapId` when only that map's changed. */
export type ScoresChange = { n: number, beatmapId?: number };

const scoresChanged = (beatmapId?: number) =>
	void scoresVersion.set({
		n: scoresVersion.get().n + 1, beatmapId, 
	});

/** a map's top play at one rate: its grade, its order (rank value, then id), the last play,
 *  its score */
export type HistoryRow = [
	beatmapId: number, rate: number, grade: Grade, value: number, id: number, lastPlayed: number,
	score: number,
];

/** Finds the local copy of a server score, if this device holds one; free it once done.
 *  A map plays in one ruleset, so its map and kind tell apart scores whose ids count in
 *  other tables. Id 0 was never stored: each such play is its own. */
const copyFinder = (db: Database) => {
	const stmt = db.prepare(
		`SELECT * FROM score INDEXED BY idx_score_online_id
			WHERE onlineId = ? AND unranked = ? AND beatmapId = ? LIMIT 1`,
	);
	return {
		find: (dto: ScoreDTO) => {
			if (!dto.id) return undefined;
			stmt.bind([dto.id, dto.unranked ? 1 : 0, dto.beatmapId]);
			const row = stmt.step() ? t.decode(stmt.getAsObject()) : undefined;
			stmt.reset();
			return row;
		},
		free: () => stmt.free(),
	};
};

/** The XP the server says each synced play earned, under its local copy. A copy already
 *  holding gains (its result was shown here) keeps them. Whether any were written. */
const keepGains = (db: Database, dtos: readonly ScoreDTO[], rows: readonly Score[]): boolean => {
	if (!dtos.some(d => d.gains)) return false;
	const stmt = db.prepare(`INSERT OR IGNORE INTO score_xp
		(scoreId, characterId, beatmapId, playedAt, gains) VALUES (?, ?, ?, ?, ?)`);
	let wrote = false;
	dtos.forEach(({ gains }, i) => {
		const score = rows[i];
		if (!gains || !score.id) return;
		stmt.run([score.id, score.characterId, score.beatmapId, score.playedAt, JSON.stringify(gains)]);
		wrote = true;
	});
	stmt.free();
	return wrote;
};

/** Scores stored in one write at most: a bigger one holds the game up while it runs. */
const WRITE_ROWS = 200;

/** Make `score` its map's best in `best` when it `beats` the one held there. */
const keepIfBest = (db: Database, best: string, score: Score, beats: (held: Score) => boolean) => {
	const [held] = t.select(db, `SELECT s.* FROM ${best} b JOIN score s ON s.id = b.scoreId
		WHERE b.characterId = ? AND b.beatmapId = ?`, [score.characterId, score.beatmapId]);
	if (held && !beats(new Score(held))) return;
	db.run(`INSERT OR REPLACE INTO ${best} (characterId, beatmapId, scoreId) VALUES (?, ?, ?)`,
		[score.characterId, score.beatmapId, score.id]);
};

export class Score extends DAO(t) {

	async add() {
		await super.add();

		const currentBest = await Score.best(this.characterId, this.beatmapId);

		if (!currentBest || this.isHigherThan(currentBest)) {
			await ScoreBest.fromScore(this).add();
		}

		const currentBestPP = await Score.bestPP(this.characterId, this.beatmapId);

		if (!currentBestPP || this.hasHigherPPThan(currentBestPP)) {
			await ScoreBestPP.fromScore(this).add();
		}

		scoresChanged(this.beatmapId);

		return this;
	}

	public isHigherThan(score: Score): boolean {
		return betterScore(this, score);
	}

	public hasHigherPPThan(score: Score): boolean {
		return this.pp > score.pp;
	}

	static fromDTO(dto: ScoreDTO): Score {
		const { judgements, ...rest } = dto;
		return new Score({
			...rest, ...judgements as Record<Judgement, number>, onlineId: dto.id, id: undefined, 
		});
	}

	/** Swap `characterIds`' copies of server scores for `fetched`, bests worked out again.
	 *  Local-only plays stay, and so does a copy played after `before` (one that finished
	 *  while `fetched` was downloading). */
	static async replaceServerScores(
		characterIds: readonly number[],
		fetched: readonly ScoreDTO[],
		before: number,
	): Promise<void> {
		if (!characterIds.length) return;
		const ids = characterIds.map(Number).join(', ');
		await DB.write(db => {
			db.run(
				`DELETE FROM score WHERE characterId IN (${ids}) AND onlineId != -1 AND playedAt <= ?`,
				[before],
			);
			// a reused id would hand a new score the gains of the one that held it
			db.run(`DELETE FROM score_xp WHERE characterId IN (${ids})
				AND scoreId NOT IN (SELECT id FROM score)`);
			const bests = [['score_best', `${rankValueSQL()} DESC`], ['score_best_pp', 'pp DESC']];
			for (const [best, order] of bests) {
				db.run(`DELETE FROM ${best} WHERE characterId IN (${ids})`);
				db.run(`INSERT INTO ${best} (characterId, beatmapId, scoreId)
					SELECT characterId, beatmapId, id FROM (
						SELECT characterId, beatmapId, id, ROW_NUMBER() OVER (
							PARTITION BY characterId, beatmapId ORDER BY ${order}, id ASC
						) AS n FROM score WHERE characterId IN (${ids})
					) WHERE n = 1`);
			}
		});
		await Score.storeServerScores(fetched);
	}

	/** {@link addServerScores} for a batch of any size: a few hundred per write, the game
	 *  drawing in between, and the views told once at the end. */
	static async storeServerScores(dtos: readonly ScoreDTO[]): Promise<void> {
		for (let i = 0; i < dtos.length; i += WRITE_ROWS) {
			await Score.addServerScores(dtos.slice(i, i + WRITE_ROWS), false);
			await new Promise(resolve => setTimeout(resolve));
		}
		scoresChanged();
		xpGainsChanged();
	}

	/** Keep copies of server scores this device does not hold yet, and the bests of the
	 *  maps they land on. Each one's local copy, in order: the one already held, or the new one. */
	static async addServerScores(dtos: readonly ScoreDTO[], announce = true): Promise<Score[]> {
		if (!dtos.length) return [];
		// each map's best new play by score and by pp, set against the bests held
		const added = new Map<string, [Score, Score]>();
		let gained = false;
		const saved = await DB.write(db => {
			const copies = copyFinder(db);
			const inserts = t.inserter(db);
			const rows = dtos.map(dto => {
				const held = copies.find(dto);
				if (held) return new Score(held);
				const score = Score.fromDTO(dto);
				score.id = inserts.insert(score as unknown as Insert<typeof t.columns>);
				const key = `${score.characterId}:${score.beatmapId}`;
				const [byScore, byPP] = added.get(key) ?? [score, score];
				added.set(key, [
					score.isHigherThan(byScore) ? score : byScore, score.hasHigherPPThan(byPP) ? score : byPP,
				]);
				return score;
			});
			copies.free();
			inserts.free();
			gained = keepGains(db, dtos, rows);
			for (const [byScore, byPP] of added.values()) {
				keepIfBest(db, 'score_best', byScore, held => byScore.isHigherThan(held));
				keepIfBest(db, 'score_best_pp', byPP, held => byPP.hasHigherPPThan(held));
			}
			return rows;
		});
		if (announce && added.size) {
			const maps = new Set([...added.values()].map(([s]) => s.beatmapId));
			scoresChanged(maps.size === 1 ? [...maps][0] : undefined);
		}
		if (announce && gained) xpGainsChanged(dtos.length === 1 ? dtos[0].beatmapId : undefined);
		return saved;
	}

	/** When the newest server score these characters hold here was played, if any. */
	static async lastServerPlay(characterIds: readonly number[]): Promise<number | undefined> {
		if (!characterIds.length) return undefined;
		const at = await DB.read(db => db.exec(`SELECT MAX(playedAt) FROM score
			WHERE characterId IN (${characterIds.map(Number).join(', ')}) AND onlineId > 0`)[0]?.values[0][0]);
		return typeof at === 'number' ? at : undefined;
	}

	/** Every character's local scores on this difficulty, with their bests, XP and fails. */
	static async clearBeatmap(beatmapId: number): Promise<void> {
		await MemoryFail.ensure();
		await DB.write(db => {
			const tables = [this.table, ScoreBest.table, ScoreBestPP.table, ScoreXP.table, MemoryFail.table];
			for (const table of tables)
				db.run(`DELETE FROM ${table.name} WHERE beatmapId = ?`, [beatmapId]);
		});
		scoresChanged(beatmapId);
		xpGainsChanged(beatmapId);
	}

	static best(
		characterId: number, 
		beatmapId: number,
	): Promise<Score | undefined> {
		return this.first(
			`SELECT s.* FROM score s
				JOIN score_best b ON b.scoreId = s.id
				WHERE b.characterId = ? AND b.beatmapId = ?`,
			[characterId, beatmapId],
		);
	}

	/** Best score at this rate; rates are RATE_STEP multiples, the tolerance absorbs float drift. */
	static bestAtRate(
		characterId: number,
		beatmapId: number,
		rate: number,
	): Promise<Score | undefined> {
		return this.first(
			`SELECT * FROM score
				WHERE characterId = ? AND beatmapId = ? AND ABS(rate - ?) < 0.001
				ORDER BY ${rankValueSQL()} DESC, id ASC LIMIT 1`,
			[characterId, beatmapId, rate],
		);
	}

	static bestPP(
		characterId: number, 
		beatmapId: number,
	): Promise<Score | undefined> {
		return this.first(
			`SELECT s.* FROM score s
				JOIN score_best_pp b ON b.scoreId = s.id
				WHERE b.characterId = ? AND b.beatmapId = ?`,
			[characterId, beatmapId],
		);
	}

	/**
	 * What song select's cards show of a character's plays, in one pass of SQLite over them:
	 * per map and rate, the top play's grade and order (its rank value, then id) and when the
	 * map was last played at that rate. No play is turned into a Score here.
	 */
	static history(characterId: number, beatmapId?: number): Promise<HistoryRow[]> {
		const where = beatmapId === undefined ? '' : ' AND beatmapId = ?';
		const params = beatmapId === undefined ? [characterId] : [characterId, beatmapId];
		return DB.read(db => (db.exec(`SELECT beatmapId, rate, grade, value, id, lastPlayed, score FROM (
			SELECT beatmapId, rate, grade, id, score, ${rankValueSQL()} AS value,
				MAX(playedAt) OVER (PARTITION BY beatmapId, rate) AS lastPlayed,
				ROW_NUMBER() OVER (PARTITION BY beatmapId, rate ORDER BY ${rankValueSQL()} DESC, id ASC) AS n
			FROM score WHERE characterId = ?${where}
		) WHERE n = 1`, params)[0]?.values ?? []) as unknown as HistoryRow[]);
	}

	static recent(characterId: number, limit = 50): Promise<Score[]> {
		return this.query(
			'SELECT * FROM score WHERE characterId = ? ORDER BY playedAt DESC LIMIT ?',
			[characterId, limit],
		);
	}

	/** A map's plays by `sort` (equal pp, as on loved maps, falls back to score), all
	 *  characters' or one's. */
	static forBeatmap(
		beatmapId: number, sort: BoardSort, characterId?: number, limit = 50,
	): Promise<Score[]> {
		const order = `${sort === 'pp' ? 'pp DESC, ' : ''}${rankValueSQL()} DESC, id ASC`;
		return characterId === undefined
			? this.query(
				`SELECT * FROM score WHERE beatmapId = ? ORDER BY ${order} LIMIT ?`, [beatmapId, limit],
			)
			: this.query(
				`SELECT * FROM score WHERE characterId = ? AND beatmapId = ? ORDER BY ${order} LIMIT ?`,
				[characterId, beatmapId, limit],
			);
	}

	/** Local plays of this map that still train memory - the memory skill for guest /
	 *  unranked plays (ranked uses the server's): passes, and fails by the share of the
	 *  map they reached, since its last prestige, less what each memory upgrade bought
	 *  after that forgot. */
	static async countPlays(
		characterId: number,
		beatmapId: number,
		since = 0,
		forgetAt: readonly number[] = [],
	): Promise<number> {
		await MemoryFail.ensure();
		return DB.read(db => {
			const res = db.exec(
				`SELECT playedAt, 1 FROM score
					WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?
				UNION ALL SELECT playedAt, share FROM memory_fail
					WHERE characterId = ? AND beatmapId = ? AND playedAt >= ?`,
				[characterId, beatmapId, since, characterId, beatmapId, since],
			);
			const played = (res[0]?.values ?? []).map(([at, share]) => ({
				at: at as number, share: share as number,
			}));
			return recall(played, forgetAt.filter(t => t >= since));
		});
	}
}