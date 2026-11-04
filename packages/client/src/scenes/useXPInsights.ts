import {
	useEffect,
	useRef,
	useState,
} from 'react';

import Log from '@oss-idle/shared/helpers/log';

import type { XPGainsChange } from '../db/schema/score_xp';
import {
	XP_INSIGHT_TIER,
	type XPInsightTier,
} from '../unlocks';
import {
	type BeatmapXPInsight,
	getXPInsights,
} from '../xpInsights';

type Insights = Map<number, BeatmapXPInsight>;

/** `insights` with one map's entry read again. */
const withMap = (insights: Insights, beatmapId: number, fresh: Insights): Insights => {
	const next = new Map(insights);
	const insight = fresh.get(beatmapId);
	if (insight) next.set(beatmapId, insight);
	else next.delete(beatmapId);
	return next;
};

/**
 * Song select's XP gain indicators. A new play or a cleared map reads that map again;
 * only another character or unlock tier reads all of them, which takes a while with a
 * long history.
 */
export default function useXPInsights(
	characterId: number, tier: XPInsightTier, change: XPGainsChange,
) {
	const [insights, setInsights] = useState<Insights>();
	const readFor = useRef<string>(undefined);
	// one read at a time, in order: a play landing during a full read still reaches it
	const reads = useRef(Promise.resolve());
	useEffect(() => {
		const key = `${characterId}:${tier}`;
		const one = readFor.current === key ? change.beatmapId : undefined;
		readFor.current = key;
		const current = () => readFor.current === key;
		reads.current = reads.current.then(async () => {
			if (tier === XP_INSIGHT_TIER.LOCKED) {
				if (current()) setInsights(undefined);
			} else if (one !== undefined) {
				const fresh = await getXPInsights(characterId, one);
				if (current()) setInsights(i => i && withMap(i, one, fresh));
			} else {
				const all = await getXPInsights(characterId);
				if (current()) setInsights(all);
			}
		}).catch((e: unknown) => Log.errorPopup(String(e)));
	}, [characterId, tier, change]);
	return insights;
}
