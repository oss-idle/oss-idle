import { ph } from '@lingui/core/macro';
import './MapsetCard.css';
import {
	memo,
	useEffect,
	useRef,
	useState,
	type MouseEvent,
} from 'react';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { dateAgo } from '@oss-idle/shared/display/ago';
import { bignum } from '@oss-idle/shared/display/num';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { difficultyColor } from '@oss-idle/shared/display/difficulty';
import {
	mapDownloadLink,
	type MapCover,
	type PanelDiff,
} from '@oss-idle/shared/beatmap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
	faCircleCheck,
	faCirclePlay,
	faFileArrowDown,
	faPause,
	faPlay,
} from '@fortawesome/free-solid-svg-icons';
import {
	coverBackground,
	previewUrl,
	sendToGame,
} from '../api/maps';
import {
	preview,
	stopPreview,
	togglePreview,
} from '../preview';
import Link from './Link';
import MapperLink from './MapperLink';
import ManiaIcon from './ManiaIcon';
import MapsetDiffsPopup from './MapsetDiffsPopup';

export type Mapset = MapCover & {
	title: string;
	artist: string;
	creator: string;
	/** the mapper's osu! id, once the set is credited to them */
	ownerUserId?: number | null;
	plays: string | null;
	rankedAt: string | null;
	/** the preview track */
	audio?: string | null;
	diffs?: PanelDiff[];
	/** a player's own map shows when it went up, or into the ranking queue, instead */
	status?: string;
	submittedAt?: string;
	createdAt?: string;
};

/** osu!web shows each difficulty as a dot up to this many, a count past it. */
const MAX_DOTS = 12;

/** The status pill's colour, as osu!web's: ranked lime, pending orange - and a player's
 *  unranked upload, osu!'s unsubmitted map, orange too. */
const PILL_HUE: Record<string, string> = {
	ranked: 'lime-1', pending: 'orange-1', unranked: 'orange-1',
};

const pillStyle = (status = 'ranked') =>
	({ '--bg-hsl': `var(--hsl-${PILL_HUE[status] ?? 'lime-1'})` }) as React.CSSProperties;

const capsule = (status?: string) => status === 'unranked' ? <Trans>Unranked</Trans>
	: status === 'pending' ? <Trans>Pending</Trans>
		: <Trans>Ranked</Trans>;

/** When it was ranked, or for a player's own map, uploaded or submitted for rank. */
const dateOf = (mapset: Mapset) => mapset.status === 'unranked' ? mapset.createdAt
	: mapset.status === 'pending' ? mapset.submittedAt
		: mapset.rankedAt;

/**
 * osu!web's beatmapset panel. On hover, its info darkens, the preview's play button
 * shows over the cover, the stats appear and the download menu slides out; resting
 * on the status and difficulty dots opens the list of difficulties under it.
 *
 * Memo'd: the search page re-renders its parents per keystroke, and re-rendering
 * every mounted card per key made typing stutter itself.
 */
const MapsetCard = ({ mapset }: { mapset: Mapset }) => {
	const { t } = useLingui();
	const panel = useRef<HTMLDivElement>(null);
	const timer = useRef(0);
	const [popup, setPopup] = useState(false);
	const [playing] = useSynced(preview);
	const mine = playing?.setId === mapset.id ? playing : undefined;
	const diffs = [...mapset.diffs ?? []].sort((a, b) => a.sr - b.sr);
	const link = {
		to: '/maps/$id', params: { id: String(mapset.id) }, 
	} as const;

	useEffect(() => () => {
		clearTimeout(timer.current);
		stopPreview(mapset.id);
	}, [mapset.id]);

	const popupIn = (show: boolean, ms: number) => {
		clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setPopup(show), ms);
	};
	const keepPopup = () => {
		clearTimeout(timer.current);
		setPopup(true);
	};
	const hidePopup = () => {
		clearTimeout(timer.current);
		setPopup(false);
	};
	const download = (e: MouseEvent) => {
		e.preventDefault();
		sendToGame(mapset.id);
	};

	return (
		<div
			ref={panel}
			className={popup ? 'list__beatmap is-popup' : 'list__beatmap'}
			data-audio-state={mine?.state}
			onMouseLeave={hidePopup}
			style={{ '--progress': mine?.progress ?? 0 } as React.CSSProperties}
		>
			<MapsetDiffsPopup
				setId={mapset.id}
				diffs={diffs}
				anchor={panel.current}
				visible={popup}
				onEnter={keepPopup}
				onLeave={() => popupIn(false, 500)}
			/>
			<Link {...link} className='list__beatmap_cover-container'>
				<div className='list__beatmap_cover-col list__beatmap_cover-col--play'>
					<div className='list__beatmap_cover' style={{ backgroundImage: coverBackground(mapset, 'list') }} />
				</div>
				<div className='list__beatmap_cover-col list__beatmap_cover-col--info'>
					<div className='list__beatmap_cover' style={{ backgroundImage: coverBackground(mapset, 'card') }} />
				</div>
			</Link>
			<div className='list__beatmap_content'>
				<div className='list__beatmap_play-container'>
					{mapset.audio && (
						<button
							type='button'
							className='list__beatmap_play'
							aria-label={t`preview`}
							onClick={() => togglePreview(mapset.id, previewUrl(mapset.id, mapset.audio!))}
						>
							<FontAwesomeIcon icon={mine ? faPause : faPlay} />
						</button>
					)}
					<svg className='list__beatmap_play-progress' viewBox='0 0 50 50' aria-hidden>
						<circle cx='25' cy='25' r='22.5' pathLength='1' />
					</svg>
				</div>
				<div className='list__beatmap_info'>
					<div className='list__beatmap_row list__beatmap_row--title'>
						<Link {...link} className='list__beatmap_main-link'>{mapset.title}</Link>
					</div>
					<div className='list__beatmap_row list__beatmap_row--artist'>
						<Link {...link} className='list__beatmap_main-link'>
							<Trans>by {ph({ artist: mapset.artist })}</Trans>
						</Link>
					</div>
					<div className='list__beatmap_row list__beatmap_row--mapper'>
						<span className='list__beatmap_ellipsis'>
							<Trans>mapped by <MapperLink userId={mapset.ownerUserId} className='list__beatmap_mapper'>{ph({ creator: mapset.creator })}</MapperLink></Trans>
						</span>
					</div>
					<div className='list__beatmap_row list__beatmap_row--stats'>
						<span className='list__beatmap_stat list__beatmap_stat--plays'>
							<span className='list__beatmap_stat-icon'><FontAwesomeIcon icon={faCirclePlay} /></span>
							{bignum(mapset.plays)}
						</span>
						<span className='list__beatmap_stat list__beatmap_stat--date'>
							<span className='list__beatmap_stat-icon'><FontAwesomeIcon icon={faCircleCheck} /></span>
							{dateAgo(dateOf(mapset))}
						</span>
					</div>
					<Link
						{...link}
						className='list__beatmap_row list__beatmap_row--extra'
						onMouseEnter={() => popupIn(true, 100)}
						onMouseLeave={() => popupIn(false, 500)}
					>
						<span className='list__beatmap_extra'>
							<span className='list__beatmap_capsule' style={pillStyle(mapset.status)}>
								{capsule(mapset.status)}
							</span>
						</span>
						{diffs.length > 0 && (
							<span className='list__beatmap_extra list__beatmap_extra--dots'>
								<span className='list__beatmap_mode'><ManiaIcon /></span>
								{diffs.length > MAX_DOTS
									? <span className='list__beatmap_count'>{diffs.length}</span>
									: diffs.map(diff => (
										<span
											key={diff.id}
											className='list__beatmap_dot'
											style={{ '--bg': difficultyColor(diff.sr) } as React.CSSProperties}
										/>
									))}
							</span>
						)}
					</Link>
				</div>
				<div className='list__beatmap_menu-container'>
					<div className='list__beatmap_menu'>
						<a
							href={mapDownloadLink(mapset.id)}
							onClick={download}
							className='list__beatmap_menu-item'
							aria-label={t`Download`}
						>
							<FontAwesomeIcon icon={faFileArrowDown} />
						</a>
					</div>
				</div>
			</div>
		</div>
	);
};

export default memo(MapsetCard);
