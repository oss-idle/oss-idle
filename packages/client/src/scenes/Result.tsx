import './Result.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import accuracy from '@oss-idle/shared/display/accuracy';
import num from '@oss-idle/shared/display/num';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { SkillGain } from '@oss-idle/shared/play';
import type { MedalBatch } from '@oss-idle/shared/play';
import { showsDivine } from '@oss-idle/shared/rebirth';
import {
	JUDGEMENT,
	Judgement,
} from '@oss-idle/shared/rulesets/mania/judgement';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { ScoreDTO } from '@oss-idle/shared/score';

import useSmoothNumber from '../animations/useSmoothNumber';
import { uiSound } from '../audio/uiSounds';
import MatchRanking from '../components/multiplayer/MatchRanking';
import useMatchRanking from '../components/multiplayer/useMatchRanking';
import CountUp, { COUNT_UP_MS } from '../components/result/CountUp';
import ResultMeta from '../components/result/ResultMeta';
import ResultMods from '../components/result/ResultMods';
import ShareScoreButton from '../components/result/ShareScoreButton';
import SkillProgression from '../components/result/SkillProgression';
import useResultSounds from '../components/result/useResultSounds';
import Character from '../db/schema/character';
import { Score } from '../db/schema/score';
import DevianceGraph from '../gameplay/DevianceGraph';
import HpGraph from '../gameplay/HpGraph';
import { currentScore } from '../globals';
import Controls from '../input/Controls';
import { showMedals } from '../online/medalWatch';
import Multiplayer from '../online/multiplayer';
import PlayManager from '../online/playManager';
import {
	flushCharacter,
	flushCharacterStats,
	getCharacter,
} from '../online/services/characters';
import { flushBeatmapScores } from '../online/services/scores';
import BeatmapAPI from '../osu/beatmap/beatmap_api';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import { currentSkin } from '../osu/skin/Skin';
import { useGradeUrl } from '../osu/skin/SkinGrade';
import SkinJudgement from '../osu/skin/SkinJudgement';
import Background from './Background';
import { launchPlay } from './launchPlay';
import SceneManager from './SceneManager';

/** Two per row. Divine pairs with marvelous at the top and pushes perfect down
 *  beside great; without divine the pairing is left exactly as it was. */
const JUDGE_ORDER: Judgement[] = [
	JUDGEMENT.PERFECT, JUDGEMENT.MARVELOUS,
	JUDGEMENT.GREAT, JUDGEMENT.GOOD,
	JUDGEMENT.BAD, JUDGEMENT.MISS,
];

const DIVINE_JUDGE_ORDER: Judgement[] = [
	JUDGEMENT.DIVINE, JUDGEMENT.MARVELOUS,
	JUDGEMENT.PERFECT, JUDGEMENT.GREAT,
	JUDGEMENT.GOOD, JUDGEMENT.BAD,
	JUDGEMENT.MISS,
];

const judgeOrder = (divineCount: number): Judgement[] =>
	showsDivine(divineCount) ? DIVINE_JUDGE_ORDER : JUDGE_ORDER;

type Props = {
	score: Score | ScoreDTO,
	game?: ManiaGame,
	/** per-skill XP progression to show (local play computes it, ranked play gets
	 *  it from the server); omitted when the play awards no XP */
	progression?: SkillGain[],
	/** the play failed (HP hit 0): the score was not saved and awards no XP */
	failed?: boolean,
	/** the map this score is of. Given, the screen names it itself instead of
	 *  following the live selection, which browsing elsewhere can change. */
	beatmap?: LightBeatmap,
	/** medals this play unlocked, shown as this screen opens */
	medals?: MedalBatch,
};

export default function Result({ score, game, progression, failed, beatmap, medals }: Props) {
	const [skin] = useSynced(currentSkin);
	const gradeImage = useGradeUrl(skin, score.grade, true);
	// a play just watched, not a score opened from a leaderboard
	useResultSounds(!!beatmap);

	const count = (j: Judgement): number =>
		score instanceof Score ? score[j] : score.judgements[j];

	const gains = progression
		?.filter((p) => p.gained > 0)
		.sort((a, b) => b.gained - a.gained) ?? [];

	useEffect(() => {
		if (!gains) return;
		void flushBeatmapScores(score.beatmapId);
		void flushCharacter(score.characterId);
		void flushCharacterStats(score.characterId);
	}, [gains]);

	useEffect(() => {
		currentScore.set(score);
		return () => { currentScore.set(undefined); };
	}, []);

	useEffect(() => {
		if (medals) showMedals(medals);
	}, [medals]);

	// a play just watched, not a score opened from a leaderboard
	useEffect(() => {
		if (beatmap) PlayManager.holdForResult();
		return () => PlayManager.leftResult();
	}, []);

	// leaving the result screen no longer stops anything: the queue runs whether
	// or not a scene is watching it (stop it from the dock instead)
	// a match play's standings, at the right edge as on osu!'s ranking screen
	const ranking = useMatchRanking(score);

	const onBack = () => {
		uiSound('ui/screen-back');
		SceneManager.set(Multiplayer.afterPlay());
	};
	Controls.back.usePress(onBack);
	const [match] = useSynced(Multiplayer.current);
	const retryable = beatmap && !match;
	// the queue's countdown would otherwise replace the retry once it is on screen
	const retry = () => {
		if (beatmap && launchPlay(beatmap)) PlayManager.cancelChain();
	};

	const player = useAsync(async () => Character.isLocalId(score.characterId)
		? Character.get({ id: score.characterId })
		: await getCharacter(score.characterId), [score.characterId]);
	const loved = useAsync(() => BeatmapAPI.isLoved(score.beatmapId), [score.beatmapId]);

	const displayScore = Math.round(score.score);
	const shownScore = useSmoothNumber(displayScore, { 
		duration: COUNT_UP_MS, 
		from: 0, 
	});

	const playedAt = new Date(score.playedAt).toLocaleString(undefined, {
		dateStyle: 'medium', timeStyle: 'short',
	});
	const playerName = player?.name ?? '--';

	// narrow screens put the xp rows past the buttons, whatever width their labels take
	const actions = useRef<HTMLDivElement>(null);
	const [actionsWidth, setActionsWidth] = useState(0);
	useEffect(() => {
		const bar = actions.current;
		if (!bar) return;
		const observer = new ResizeObserver(() => setActionsWidth(bar.offsetWidth));
		observer.observe(bar);
		return () => observer.disconnect();
	}, []);
	const ur = score.ur.toFixed(2);
	const judges = judgeOrder(count(JUDGEMENT.DIVINE));

	return (<>
		<Background beatmap={beatmap} />
		<div
			className="resultscreen"
			style={{ '--actions-width': `${actionsWidth}px` } as React.CSSProperties}
		>
			<ResultMeta playerName={playerName} playedAt={playedAt} beatmap={beatmap} rate={score.rate} />
			{ranking && <MatchRanking ranking={ranking} />}
			<div className="result__actions" ref={actions}>
				<button className="result__exit" onClick={onBack} data-sound="hover">
					<Trans>BACK</Trans>
				</button>
				{retryable && <button className="result__exit" onClick={retry}>
					<Trans>RETRY</Trans>
				</button>}
				<ShareScoreButton
					score={score}
					loved={loved}
					beatmap={beatmap}
					game={game}
					gradeImage={gradeImage ?? ''}
					playerName={playerName}
					playedAt={playedAt}
					judges={judges.map(j => ({
						label: skin.data.judgements[j].text, count: count(j), color: skin.data.judgements[j].judge,
					}))}
					gains={gains}
					failed={failed}
					ranking={ranking}
				/>
			</div>
			<div className="result">
				<div className="result__left">
					<div className="result__topleft">
						<div className="result__panel">
							<div className="result__score">
								{Math.round(shownScore).toString().padStart(7, '0')}
							</div>

							<div className="result__judges">
								{judges.map((j) => (
									<div key={j} className="result__judge">
										<SkinJudgement
											skin={skin}
											judgement={j}
											className="result__judge-label"
										/>
										<span 
											className="result__judge-count" 
											style={{
												textShadow: `0 0px 4px ${skin.data.judgements[j].judge}`,
												width: `${String(count(j)).length}ch`,
											}}>
											<CountUp value={count(j)} 
											/></span>
									</div>
								))}
							</div>

							<div className="result__totals">
								<div className="result__total">
									<span className="result__total-label"><Trans>Performance</Trans></span>
									<span className="result__total-value">
										{loved ? '—' : <>{num(score.pp)}pp</>}
									</span>
								</div>
								<div className="result__total">
									<span className="result__total-label"><Trans>Combo</Trans></span>
									<span className="result__total-value">
										{score.maxCombo}x{score.pfc && <em className="result__pfc"> PFC</em>}
									</span>
								</div>
								<div className="result__total">
									<span className="result__total-label"><Trans>Accuracy</Trans></span>
									<span className="result__total-value">
										{accuracy(score.accuracy)}
									</span>
								</div>
							</div>
						</div>
						<div className="result__progression">
							<SkillProgression failed={failed} progression={progression} gains={gains} />
						</div>
					</div>
					<div className="result__graphs">
						<figure className="result__graph">
							<figcaption>HP</figcaption>
							<div className="result__graph-hp">
								{game
									? <HpGraph game={game} height={240} />
									: <div className="result__graph-empty"><Trans>No replay data</Trans></div>}
								{failed && <div className="result__failed">
									<Trans>FAILED</Trans>
								</div>}
							</div>
						</figure>
						<figure className="result__graph">
							<figcaption><Trans>Hit deviance · {ur} UR</Trans></figcaption>
							{game
								? <DevianceGraph game={game} height={240} />
								: <div className="result__graph-empty"><Trans>No replay data</Trans></div>}
						</figure>
					</div>
				</div>

				<div className="result__right">
					<div className="result__grade-box">
						{skin.grade(score.grade, 'result__grade', true)}
						<ResultMods rate={score.rate} mods={score.mods} />
					</div>
				</div>

			</div>
		</div>
	</>);
}
