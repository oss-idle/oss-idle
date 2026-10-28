import { Trans } from '@lingui/react/macro';
import {
	memo,
	useRef,
} from 'react';

import {
	difficultyColor,
	isDarkDifficulty,
	starsText,
} from '@oss-idle/shared/display/difficulty';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import {
	Score,
	scoresVersion,
} from '../db/schema/score';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import {
	canPlayAt,
	liveSpeedUpgrades,
	selectedRate,
} from '../gameplay/playRate';
import {
	useRatedVersion,
	useStarsOf,
} from '../gameplay/rateStars';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import LightBeatmapSet from '../osu/beatmap/LightBeatmapSet';
import useThumbnail from '../osu/beatmap/useThumbnail';
import { currentSkin } from '../osu/skin/Skin';
import type { BeatmapXPInsight } from '../xpInsights';
import BeatmapCardXP from './BeatmapCardXP';
import { DownloadState } from './BeatmapCarousel';
import { useSelection } from './songselect/selection';

/** max gap between two clicks on the same card to count as a double-click */
const DOUBLE_CLICK_MS = 300;

/** Build the card's state classes (active / sibling / download status / reach). */
function cardClassName(
	active: boolean, 
	sibling: boolean,
	downloaded: boolean,
	reachable: boolean,
): string {
	return `bm-card ${active ? 'is-active' : ''} ${
		sibling ? 'is-sibling' : ''
	} ${downloaded ? 'is-downloaded' : 'is-remote'} ${reachable ? '' : 'is-unreachable'}`;
}

type Props = {
	beatmap: LightBeatmap,
	set: LightBeatmapSet,

	onCardClick: (beatmap: LightBeatmap, set: LightBeatmapSet) => void
	onCardDoubleClick: (beatmap: LightBeatmap, set: LightBeatmapSet) => void

	downloads: Record<number, DownloadState>
	/** XP gained on the last play of this difficulty, when the feature is unlocked */
	xpInsight?: BeatmapXPInsight
};

function BeatmapCard({
	beatmap, set,
	onCardClick, onCardDoubleClick,
	downloads, xpInsight,
}: Props) {
	const [skin] = useSynced(currentSkin);

	const stars = useStarsOf(beatmap);

	const [showThumbnails] = useSynced(SETTINGS.showThumbnails);
	const bg = useThumbnail(beatmap, showThumbnails);

	// Grade is per-character: re-query when the live character changes (e.g. a
	// disconnect falling back to guest, or reconnecting back to the account) so
	// the card always reflects whoever is currently signed in.
	const [character] = useSynced(Entities.character);
	// scoresVersion bumps on any score write, so an imported leaderboard score for
	// the live character refreshes the grade without a reselect.
	const [scoresV] = useSynced(scoresVersion);
	const [pickedRate] = useSynced(selectedRate);
	const rate = beatmap.lockedRate ?? pickedRate ?? 1;
	const grade = useAsync(async () => 
		(await Score.bestAtRate(character.id, beatmap.metadata.id, rate))?.grade
	, [beatmap, character.id, scoresV, rate]);

	const version = useRatedVersion(beatmap);
	useSynced(liveSpeedUpgrades);
	const reachable = canPlayAt(beatmap.lockedRate);
	const artist = set.metadata.artist;
	const title = set.metadata.title;
	const creator = set.metadata.creator;

	// Detect double-click ourselves rather than using native onDoubleClick: the
	// browser fires dblclick on two clicks within its time/distance threshold
	// regardless of which card each hit, so fast clicks across different sets get
	// misread as a double-click. This ref is per-card (cards are keyed by version
	// id), so two clicks only count as a double-click on the *same* card.
	const lastClickRef = useRef(0);
	const handleClick = () => {
		if (!reachable) return;
		const now = Date.now();
		if (now - lastClickRef.current <= DOUBLE_CLICK_MS) {
			lastClickRef.current = 0;
			onCardDoubleClick(beatmap, set);
		} else {
			lastClickRef.current = now;
			onCardClick(beatmap, set);
		}
	};

	// its role, not the selection itself: a map switch re-renders the cards it changes,
	// not every mounted one
	const role = useSelection().use(b => (
		beatmap.is(b) ? 'active' : set.is(b?.set) ? 'sibling' : 'other'
	));
	const active = role === 'active';
	const sibling = role === 'sibling';

	const dl = downloads[set.metadata.id];
	const downloaded = !!beatmap.metadata.runtime || dl?.status === 'done';
	const downloading = dl?.status === 'downloading';
	const color = difficultyColor(stars);
	return (
		<div
			className={cardClassName(active, sibling, downloaded, reachable)}
			data-id={beatmap.metadata.id}
			data-lock={beatmap.lock}
			onClick={handleClick}
			style={bg ? { backgroundImage: `url("${bg}")` } : undefined}
		>
			<div className="bm-card__scrim" />
			<div className="bm-card__inner">
				{grade && skin.grade(grade)}
				<div className="bm-card__body">
					<div className="bm-card__title">
						<span className="bm-card__title-text">{title}</span>
						{!downloaded && !downloading && (<div className='bm-card__dl'>
							- <Trans>Double click to download</Trans>
						</div>)}
					</div>
					<div className="bm-card__artist">{artist}</div>
					<div className="bm-card__meta" data-dark={isDarkDifficulty(stars)}>
						<span className="bm-card__stars" style={{ color }}>
							★ {starsText(stars)}
						</span>
						<span className="bm-card__version" style={{ color }}>
							{version}
						</span>
						<span className="bm-card__creator"><Trans>mapped by {creator}</Trans></span>
					</div>
				</div>
			</div>

			<BeatmapCardXP insight={xpInsight} />

			{downloading && (
				<span
					className="bm-card__progress"
					style={{ width: `calc((100% - var(--bleed)) * ${Math.round((dl?.progress ?? 0) * 100) / 100})` }}
				/>
			)}
		</div>
	);
}

// a card scrolling into the carousel re-renders the carousel, not every other card
export default memo(BeatmapCard);
