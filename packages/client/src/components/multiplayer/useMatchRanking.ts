import useSynced from '@oss-idle/shared/hooks/useSynced';
import type {
	LastRound,
	RoundScore,
} from '@oss-idle/shared/multiplayer';
import type { ScoreDTO } from '@oss-idle/shared/score';

import Multiplayer from '../../online/multiplayer';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import useLiveScores from './useLiveScores';

type Played = Pick<ScoreDTO, 'beatmapId' | 'characterId' | 'playedAt'>;

export type Ranking = {
	results: RoundScore[],
	/** the round is over: these are the final standings */
	final: boolean,
	/** the score being shown */
	viewed: number,
	/** open a player's result, once the round is over - failed ones too */
	view: (characterId: number) => void,
};

/** Whether a score is one of the last round's, the one the ranking is about. */
const ofRound = (score: Played, round: LastRound | undefined): round is LastRound =>
	!!round && round.beatmapId === score.beatmapId && score.playedAt >= round.startedAt
	&& round.results.some(r => r.characterId === score.characterId);

/** The match's standings for a result screen: live while others still play, then
 *  final. Undefined when the score isn't a match play. */
export default function useMatchRanking(score: Played): Ranking | undefined {
	const [match] = useSynced(Multiplayer.current);
	const live = !!match && Multiplayer.inRound(match, score.beatmapId);
	const liveScores = useLiveScores(live);
	const round = match?.lastRound;
	const final = !live && ofRound(score, round);
	if (!live && !final) return undefined;

	const view = (characterId: number) => {
		const theirs = final ? round.results.find(r => r.characterId === characterId) : undefined;
		if (theirs?.result) SceneManager.set(SCENE.RESULT, {
			id: 0, unranked: false, ...theirs.result,
		}, undefined, undefined, theirs.failed);
	};
	return {
		results: final ? round.results : liveScores,
		final,
		viewed: score.characterId,
		view,
	};
}
