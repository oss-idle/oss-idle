import './ScoreEntry.css';

import {
	memo,
	useState,
} from 'react';

import accuracy from '@oss-idle/shared/display/accuracy';
import { recentTimeAgo } from '@oss-idle/shared/display/ago';
import num from '@oss-idle/shared/display/num';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { ScoreDTO } from '@oss-idle/shared/score';

import { Score } from '../../db/schema/score';
import Entities from '../../entity/entities';
import type { BoardPlayer } from '../../online/services/scores';
import { currentSkin } from '../../osu/skin/Skin';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import ScoreMods from './ScoreMods';
import ScoreTooltip from './ScoreTooltip';
import useScorePlayer from './useScorePlayer';

interface Props {
	score: Score | ScoreDTO,
	previous?: { score: number, pp: number },
	/** Who set it, when the leaderboard already says. */
	player?: BoardPlayer,
	rank?: number,
	/** The board is by pp: the row says its pp. */
	pp?: boolean,
}

/** How far ahead of the row below: in pp on a board by pp (as the rows show it), else in score. */
const gap = (score: Props['score'], previous: Props['previous'], byPp: boolean) => {
	const ahead = !previous ? 0 : byPp
		? Math.round(score.pp) - Math.round(previous.pp)
		: score.score - previous.score;
	if (ahead <= 0) return '-';
	return byPp ? `+${num(ahead)}pp` : `+${num(ahead)}`;
};

function ScoreEntry({
	score, previous, rank, player, pp,
}: Props) {
	const [skin] = useSynced(currentSkin);

	const { character, avatarUrl, loaded } = useScorePlayer(score, player);

	const ago = recentTimeAgo(Date.now() - score.playedAt);

	const [hover, setHover] = useState(false);
	const [mouse, setMouse] = useState({
		x: 0, y: 0, 
	});
	const self = character?.name === Entities.character.get().name;
	const byPp = !!pp && score.pp > 0;

	return (
		<li
			key={score.id}
			className={
				`score_entry__row ${loaded ? 'loaded' : ''} ${score.pfc ? 'is-pfc' : ''}`
			}
			onClick={() => SceneManager.set(SCENE.RESULT, score)}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			onMouseMove={e => setMouse({
				x: e.clientX, y: e.clientY, 
			})}
		>
			<span 
				className="score_entry__avatar" 
				style={{ backgroundImage: `url(${avatarUrl})` }}
			>
				{rank !== undefined && <span className="score_entry__rank">#{rank}</span>}
			</span>
			<span className="score_entry__grade">
				{skin.grade(score.grade)}
			</span>
			<span className="score_entry__main">
				<span className={
					`score_entry__name ${self ? 'score_self' : ''}`
				}>
					{character ? character.name : 'Loading...'}
				</span>
				<span className="score_entry__score">
					Score: {num(score.score)} ({score.maxCombo}x)
				</span>
			</span>
			{byPp && <span className="score_entry__pp">
				{num(Math.round(score.pp))}<small>pp</small>
			</span>}
			<span className="score_entry__stats">
				<ScoreMods rate={score.rate} mods={score.mods} />
				<span className="score_entry__acc">
					{accuracy(score.accuracy)}
				</span>
				<span className="score_entry__diff">{gap(score, previous, byPp)}</span>
			</span>

			{ago && <span className="score_entry__time">
				<img src="/new.png"/>
				{ago}
			</span>}

			{hover && <ScoreTooltip score={score} x={mouse.x} y={mouse.y} />}
		</li>
	);
}

// a score arriving on the board renders itself, not every score already there
export default memo(ScoreEntry);
