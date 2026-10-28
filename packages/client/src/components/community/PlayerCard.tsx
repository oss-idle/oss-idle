import './PlayerCard.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	memo,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from 'react';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import accuracyText from '@oss-idle/shared/display/accuracy';
import { statusName } from '@oss-idle/shared/display/community';
import { countryName } from '@oss-idle/shared/display/country';
import {
	isFirst,
	rankTier,
	rankTierGradient,
} from '@oss-idle/shared/display/rankTier';

const timeFormats = new Map<string, Intl.DateTimeFormat>();
const timeFormat = (locale: string, tz?: string) => {
	const key = `${locale}|${tz ?? ''}`;
	let format = timeFormats.get(key);
	if (!format) {
		format = new Intl.DateTimeFormat(locale, {
			hour: '2-digit',
			minute: '2-digit',
			...(tz ? { timeZone: tz } : {}),
		});
		timeFormats.set(key, format);
	}
	return format;
};

/**
 * One online character, osu!stable user-panel style: avatar, name and a
 * status-tinted strip. Shows the character's stats, swapping to its local time,
 * country and status on hover.
 */
function PlayerCard({ character, onClick, className = '' }: {
	character: PresenceEntry;
	onClick?: (character: PresenceEntry) => void;
	className?: string;
}) {
	const { i18n } = useLingui();
	// Memoized, so the local time only moves on hover, where it shows.
	const [, refresh] = useReducer((n: number) => n + 1, 0);

	// Fade the avatar in on load - but skip the fade if it's already cached
	// (complete before we mount), so cached cards don't flash.
	const avatarRef = useRef<HTMLImageElement>(null);
	const [avatarLoaded, setAvatarLoaded] = useState(false);
	const [avatarInstant, setAvatarInstant] = useState(false);
	useLayoutEffect(() => {
		if (avatarRef.current?.complete) {
			setAvatarInstant(true);
			setAvatarLoaded(true);
		}
	}, []);

	// Fall back to the viewer's local zone when the character has no geo tz
	// (e.g. localhost / a lookup miss) so it shows a time, not a dash.
	const localTime = timeFormat(i18n.locale, character.tz).format(new Date());
	const country = countryName(character.country, i18n.locale);
	const statusText = character.status === 'playing' && character.nowPlaying
		? character.nowPlaying
		: statusName(character.status);

	const pp = Math.round(character.pp).toLocaleString(i18n.locale);
	const accuracy = accuracyText(character.accuracy);
	const playCount = character.playCount.toLocaleString(i18n.locale);
	const level = character.level;
	const tier = rankTier(character.rank, character.rankPercent);
	const first = !!tier && isFirst(character.rank);
	const rankClass = [
		'player-card__rank', tier && 'is-tiered', first && 'is-first',
	].filter(Boolean).join(' ');

	return (
		<div
			className={`player-card ${className}`}
			data-status={character.status}
			onClick={() => onClick?.(character)}
			onMouseEnter={refresh}
		>
			<div className="player-card__avatar">
				<img
					ref={avatarRef}
					src={character.avatarUrl}
					alt=""
					data-loaded={avatarLoaded}
					data-instant={avatarInstant}
					onLoad={() => setAvatarLoaded(true)}
				/>
			</div>
			<div className="player-card__body">
				<span
					className={rankClass}
					style={tier && !first ? { backgroundImage: rankTierGradient(tier) } : undefined}
				>
					{character.rank ? `#${character.rank}` : '—'}
				</span>
				<span className="player-card__name">{character.name}</span>
				<div className="player-card__meta">
					<div className='player-card-side recto'>
						<span className="player-card__sub"><Trans>Performance: {pp}pp</Trans></span>
						<span className="player-card__sub"><Trans>Accuracy: {accuracy}</Trans></span>
						<span className="player-card__sub"><Trans>Play Count: {playCount} (Lv{level})</Trans></span>
					</div>
					<div className='player-card-side verso'>
						<span className="player-card__sub">{localTime} @ {country}</span>
						<span className="player-card__sub">{statusText}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export default memo(PlayerCard);
