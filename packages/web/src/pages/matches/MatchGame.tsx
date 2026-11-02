import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import { coverBackground } from '../../api/maps';
import MatchGameScore from './MatchGameScore';
import type { HistoryGame } from './types';

/** A map played in the match: its cover, when, and every player's score. */
export default function MatchGame({ game }: { game: HistoryGame }) {
	const { i18n } = useLingui();
	const time = (at: number) => new Date(at).toLocaleTimeString(i18n.locale);
	const { beatmap } = game;
	const bestCombo = Math.max(0, ...game.scores.map(s => s.maxCombo));

	return (
		<section className='match__game'>
			<div
				className='match__game-header'
				style={{
					backgroundImage: coverBackground({
						id: beatmap.setId, osuId: beatmap.osuSetId, osuCover: beatmap.osuCover, background: beatmap.background,
					}, 'cover'), 
				}}
			>
				<div className='match__game-info'>
					<span>
						{time(game.startedAt)}
						{game.endedAt === undefined
							? <> <Trans>(match in progress)</Trans></>
							: <> - {time(game.endedAt)}</>}
					</span>
					<span>osu!mania</span>
					<span><Trans>Highest Score</Trans></span>
				</div>
				<div className='match__game-map'>
					<div className='match__game-title'>{beatmap.title} [{beatmap.version}]</div>
					<div className='match__game-artist'>{beatmap.artist}</div>
				</div>
			</div>
			{game.scores.length > 0 && (
				<div className='match__scores'>
					{game.scores.map((s, i) => (
						<MatchGameScore key={s.player?.id ?? i} score={s} best={s.maxCombo === bestCombo} />
					))}
				</div>
			)}
		</section>
	);
}
