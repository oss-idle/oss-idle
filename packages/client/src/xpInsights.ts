import { ScoreXP } from './db/schema/score_xp';
import { selectedDef } from './rulesets/registry';
import {
	UNLOCKS,
	XP_INSIGHT_TIER,
	type XPInsightTier,
} from './unlocks';

export type XPInsightSource = 'history' | 'simulation';

/** What song select can say about a map's XP yield for a character. */
export type BeatmapXPInsight = {
	beatmapId: number;
	source: XPInsightSource;
	/** when the play behind the data happened (history source) */
	playedAt: number;
	total: number;
	bySkill: Record<string, number>;
	top?: { skill: string, gained: number };
};

type XPInsightProvider = {
	source: XPInsightSource;
	/** the unlock tier this provider's data needs */
	tier: XPInsightTier;
	load: (characterId: number, beatmapId?: number) => Promise<Map<number, BeatmapXPInsight>>;
};

const historyProvider: XPInsightProvider = {
	source: 'history',
	tier: XP_INSIGHT_TIER.HISTORY,
	load: async (characterId, only) => {
		const insights = new Map<number, BeatmapXPInsight>();
		for (const [beatmapId, row] of await ScoreXP.latestByBeatmap(characterId, only)) {
			const bySkill: Record<string, number> = {};
			let total = 0;
			let top: BeatmapXPInsight['top'];
			for (const skill of selectedDef().skills) {
				const gained = row.gainOf(skill);
				if (gained <= 0) continue;
				bySkill[skill] = gained;
				total += gained;
				if (!top || gained > top.gained) top = {
					skill, gained,
				};
			}
			if (total > 0) insights.set(beatmapId, {
				beatmapId,
				source: 'history',
				playedAt: row.playedAt,
				total,
				bySkill,
				top,
			});
		}
		return insights;
	},
};

// ordered lowest tier first: a higher-tier provider (e.g. a future play
// simulation) overrides the stored history per beatmap
const providers: XPInsightProvider[] = [historyProvider];

/** Bulk XP insights for every beatmap the character has data on (or only `beatmapId`),
 *  gated by the current unlock tier. Bulk by design so group/sort modes can reuse it. */
export const getXPInsights = async (
	characterId: number,
	beatmapId?: number,
): Promise<Map<number, BeatmapXPInsight>> => {
	const tier = UNLOCKS.xpInsight.get();
	const insights = new Map<number, BeatmapXPInsight>();
	for (const provider of providers) {
		if (tier < provider.tier) continue;
		for (const [id, insight] of await provider.load(characterId, beatmapId)) {
			insights.set(id, insight);
		}
	}
	return insights;
};
