import { Trans } from '@lingui/react/macro';
import { type ReactNode } from 'react';

import {
	GroupOption,
	GroupOptions,
	SETTINGS,
	SortOption,
	SortOptions,
} from '../../db/settings';
import { type ItemStatus } from '../../osu/beatmap/grouping';
import LightBeatmap from '../../osu/beatmap/LightBeatmap';
import Dropdown from '../dropdown/Dropdown';
import BeatmapInfo from './BeatmapInfo';

/** Player-facing label for a sort/group option. The option *value* stays the
 *  raw key - comparators, the persisted setting, and grouping all branch on it
 *  so only this display text is translated. GroupOption is the superset, so one
 *  mapping covers both dropdowns. */
function optionLabel(option: GroupOption | SortOption): ReactNode {
	switch (option) {
		case 'No Grouping': return <Trans>No Grouping</Trans>;
		case 'By Artist': return <Trans>By Artist</Trans>;
		case 'By BPM': return <Trans>By BPM</Trans>;
		case 'By Creator': return <Trans>By Creator</Trans>;
		case 'By Difficulty': return <Trans>By Difficulty</Trans>;
		case 'By Download Status': return <Trans>By Download Status</Trans>;
		case 'By Length': return <Trans>By Length</Trans>;
		case 'By Playlist': return <Trans>By Playlist</Trans>;
		case 'By Rank Achieved': return <Trans>By Rank Achieved</Trans>;
		case 'By Status': return <Trans>By Status</Trans>;
		case 'By Tag': return <Trans>By Tag</Trans>;
		case 'By Title': return <Trans>By Title</Trans>;
		case 'Recently Played': return <Trans>Recently Played</Trans>;
	}
}

const GROUP_OPTIONS = GroupOptions.map((v) => ({
	value: v, 
	label: optionLabel(v),
}));
const SORT_OPTIONS = SortOptions.map((v) => ({ 
	value: v, 
	label: optionLabel(v), 
}));

/** Top bar: selected-difficulty metadata, the scores leaderboard, and the
 *  sort/group dropdowns. Empty (just the shape) until something is selected. */
export default function TopBar({ 
	version, 
	status,
	scrollSpeed,
	scoreView, 
	setScoreView, 
	compact = false,
}: {
	version: LightBeatmap | undefined;
	status: ItemStatus | undefined;
	scrollSpeed: number;
	scoreView: boolean;
	setScoreView: (v: boolean) => void;
	/** Over a running play: the grouping and sorting controls only, on nothing -
	 *  the metadata, the leaderboard and the black silhouette would all be in the
	 *  way of the play behind. */
	compact?: boolean;
}) {
	const filters = (
		<div className="game__topfilter">
			{!compact && (
				<div className="game__topfilter_scroll">
					{scrollSpeed} (fixed)
				</div>
			)}
			<div className="game__topfilter_sort">
				<div className='game__group'>
					<span><Trans>Group</Trans></span>
					<Dropdown value={SETTINGS.groupby} options={GROUP_OPTIONS} accent='#92c3e6' />
				</div>
				<div className='game__sort'>
					<span><Trans>Sort</Trans></span>
					<Dropdown value={SETTINGS.sortby} options={SORT_OPTIONS} accent='#aed28b' />
				</div>
			</div>
		</div>
	);

	if (compact) {
		return (
			<header className="game__topbar game__topbar--compact">
				{filters}
			</header>
		);
	}

	return (
		<header className="game__topbar">
			<svg 
				className="game__topshape" 
				viewBox="0 0 1000 185" 
				preserveAspectRatio="none" 
				aria-hidden
			>
				<path 
					className="game__topshape-fill" 
					d="M0 0 H1000 V100 H430 C300 100 288 185 270 185 H0 Z" 
				/>
				<path 
					className="game__topshape-edge" 
					d="M0 185 H270 C288 185 300 100 430 100 H1000" 
				/>
			</svg>
			{version && (<>
				<BeatmapInfo
					version={version}
					status={status}
					scoreView={scoreView}
					setScoreView={setScoreView}
				/>
				{filters}
			</>)}
		</header>
	);
}
