import Synced from '@oss-idle/shared/helpers/synced';
import type { SkillGain } from '@oss-idle/shared/play';

import {
	DAO,
	integer,
	table,
	text,
} from '../dao';
import type { Score } from './score';

const t = table('score_xp', {
	scoreId:     integer().primaryKey(),
	characterId: integer(),
	beatmapId:   integer(),
	playedAt:    integer(),
	/** JSON: xp per skill, by the play's ruleset's skill names */
	gains:       text().default('{}'),
}, {
	indexes: {
		idx_score_xp_character: 'characterId',
		idx_score_xp_beatmap:   'beatmapId',
	},
});

/** Bumped on every gain write so live views (song select indicators) re-query. */
export const xpGainsVersion = new Synced<XPGainsChange>({ n: 0 });

/** A change to the stored gains: `beatmapId` when only that map's changed. */
export type XPGainsChange = { n: number, beatmapId?: number };

export const xpGainsChanged = (beatmapId?: number) =>
	void xpGainsVersion.set({
		n: xpGainsVersion.get().n + 1, beatmapId,
	});

/** One play's per-skill XP gains, keyed by its local score row. */
export class ScoreXP extends DAO(t) {

	/** What the play gained on `skill`. */
	public gainOf(skill: string): number {
		return (JSON.parse(this.gains) as Record<string, number | undefined>)[skill] ?? 0;
	}

	async add() {
		await super.add();
		xpGainsChanged(this.beatmapId);
		return this;
	}

	/** Persist a play's gains alongside its saved score. No-op when the score
	 *  never reached the local DB or the play gained nothing. */
	static async record(
		score: Score,
		gains: readonly SkillGain[] | undefined,
	): Promise<void> {
		if (!score.id || !gains?.some(g => g.gained > 0)) return;
		const skillGains = Object.fromEntries(
			gains.filter(g => g.gained > 0).map(g => [g.skill, g.gained]),
		);
		await new ScoreXP({
			scoreId:     score.id,
			characterId: score.characterId,
			beatmapId:   score.beatmapId,
			playedAt:    score.playedAt,
			gains:       JSON.stringify(skillGains),
		}).add();
	}

	/** The most recent play's gains per beatmap (or only `beatmapId`'s) - the bulk shape
	 *  the song select indicators (and future group/sort modes) read. */
	static async latestByBeatmap(
		characterId: number,
		beatmapId?: number,
	): Promise<Map<number, ScoreXP>> {
		const where = beatmapId === undefined ? '' : ' AND beatmapId = ?';
		const params = beatmapId === undefined ? [characterId] : [characterId, beatmapId];
		const rows = await this.query(`SELECT * FROM score_xp WHERE scoreId IN (
			SELECT scoreId FROM (
				SELECT scoreId, ROW_NUMBER() OVER (PARTITION BY beatmapId ORDER BY playedAt DESC) AS n
				FROM score_xp WHERE characterId = ?${where}
			) WHERE n = 1
		)`, params);
		const latest = new Map<number, ScoreXP>();
		for (const row of rows) latest.set(row.beatmapId, row);
		return latest;
	}
}
