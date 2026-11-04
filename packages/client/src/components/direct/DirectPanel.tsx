import { Trans } from '@lingui/react/macro';

import BigNum from '@oss-idle/shared/display/BigNum';
import {
	difficultyColor,
	difficultyTextColor,
	starsText,
} from '@oss-idle/shared/display/difficulty';

import type { Metadata } from '../../osu/beatmap/beatmap_api';
import { coverStyle } from './directState';

const length = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The selected set: its cover, details and difficulties. */
export default function DirectPanel({ set }: { set?: Metadata }) {
	if (!set) return (
		<aside className='direct-panel is-empty'>
			<Trans>Pick a beatmap to see it here.</Trans>
		</aside>
	);

	const versions = [...set.versions].sort((a, b) => a.difficulty - b.difficulty);
	const longest = length(Math.max(...versions.map(v => v.total_length)));
	const bpm = versions[0]?.bpm ?? 0;
	const plays = <BigNum value={set.plays} theme="cold" />;
	const size = (set.size / 1024 / 1024).toFixed(1);
	const mapper = set.creator;

	return (
		<aside className='direct-panel'>
			<div className='direct-panel__cover' style={coverStyle(set)} />
			<div className='direct-panel__head'>
				<span className='direct-panel__artist'>{set.artist}</span>
				<span className='direct-panel__title'>{set.title}</span>
				<span className='direct-panel__mapper'><Trans>mapped by {mapper}</Trans></span>
			</div>
			<dl className='direct-panel__stats'>
				<div><dt><Trans>Length</Trans></dt><dd>{longest}</dd></div>
				<div><dt><Trans>BPM</Trans></dt><dd>{bpm}</dd></div>
				<div><dt><Trans>Plays</Trans></dt><dd>{plays}</dd></div>
				<div><dt><Trans>Size</Trans></dt><dd>{size} MB</dd></div>
			</dl>
			<ul className='direct-panel__diffs'>
				{versions.map(v => (
					<li key={v.id}>
						<span
							className='direct-panel__stars'
							style={{
								backgroundColor: difficultyColor(v.difficulty),
								color: difficultyTextColor(v.difficulty),
							}}
						>
							★ {starsText(v.difficulty)}
						</span>
						<span className='direct-panel__version'>{v.version}</span>
						{v.tags.map(tag => <span key={tag} className='direct-panel__tag'>{tag.toUpperCase()}</span>)}
					</li>
				))}
			</ul>
		</aside>
	);
}
