import { Grade } from '@oss-idle/shared/grade';
import Synced from '@oss-idle/shared/helpers/synced';
import {
	type Mod,
	modsKey,
	parseMods,
} from '@oss-idle/shared/mods';
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
	xpGainsVersion,
} from './score_xp';

const judgementColumns = Object.fromEntries(
	Judgements.map(j => [j, integer()]),
) as Record<Judgement, Column<number>>;

const t = table('score', {
	id:          integer().primaryKey().autoincrement(),
	onlineId:    integer().default(-1),
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
		idx_score_value:     'score DESC',
		idx_score_pp:        'pp DESC',
	},
});

/** Bumped on every score write so live views re-query
 *  instead of holding a stale best - e.g. a global leaderboard load that imports
 *  one of the live character's scores. */
export const scoresVersion = new Synced(0);

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

		void scoresVersion.set(scoresVersion.get() + 1);

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

	toDTO(): ScoreDTO {
		const int = (n: number) => (Number.isFinite(n) ? 
			Math.max(0, Math.round(n)) 
			: 0
		);

		const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

		return {
			id:          int(-1),
			characterId: Math.max(1, int(this.characterId)),
			beatmapId:   int(this.beatmapId),
			score:       int(this.score),
			accuracy:    Math.min(1,
				Number.isFinite(this.accuracy) ? Math.max(0, this.accuracy) : 0,
			),
			maxCombo:    int(this.maxCombo),
			judgements:  Object.fromEntries(
				Judgements.map(j => [j, int(this[j])]),
			) as Record<Judgement, number>,
			grade:       this.grade,
			pp:          nonNeg(this.pp),
			ur:          nonNeg(this.ur),
			pfc:         this.pfc,
			rate:        this.rate,
			mods:        this.mods,
			playedAt:    int(this.playedAt),
		};
	}

	/** Swap `characterIds`' copies of server scores for `fetched` in one write, then
	 *  work their bests out again. Local-only plays stay, and so does a copy played
	 *  after `before` (one that finished while `fetched` was downloading). */
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
			const kept = new Set((db.exec(
				`SELECT onlineId FROM score WHERE characterId IN (${ids}) AND onlineId != -1`,
			)[0]?.values ?? []).map(row => row[0] as number));
			for (const dto of fetched) {
				if (kept.has(dto.id)) continue;
				t.insert(db, Score.fromDTO(dto) as unknown as Insert<typeof t.columns>);
			}
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
		void scoresVersion.set(scoresVersion.get() + 1);
	}

	/** Every character's local scores on this difficulty, with their bests, XP and fails. */
	static async clearBeatmap(beatmapId: number): Promise<void> {
		await MemoryFail.ensure();
		await DB.write(db => {
			const tables = [this.table, ScoreBest.table, ScoreBestPP.table, ScoreXP.table, MemoryFail.table];
			for (const table of tables)
				db.run(`DELETE FROM ${table.name} WHERE beatmapId = ?`, [beatmapId]);
		});
		void scoresVersion.set(scoresVersion.get() + 1);
		void xpGainsVersion.set(xpGainsVersion.get() + 1);
	}

	static getByOnlineId(onlineId: number): Promise<Score | undefined> {
		return this.first(
			'SELECT * FROM score WHERE onlineId = ?',
			[onlineId],
		);
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

	static recent(characterId: number, limit = 50): Promise<Score[]> {
		return this.query(
			'SELECT * FROM score WHERE characterId = ? ORDER BY playedAt DESC LIMIT ?',
			[characterId, limit],
		);
	}

	static forBeatmap(beatmapId: number, limit = 50): Promise<Score[]> {
		return this.query(
			`SELECT * FROM score WHERE beatmapId = ? ORDER BY ${rankValueSQL()} DESC, id ASC LIMIT ?`,
			[beatmapId, limit],
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