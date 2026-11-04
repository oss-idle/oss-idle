import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import { bignum } from '@oss-idle/shared/display/num';
import {
	type Match,
	matchPlayers,
	matchSize,
} from '@oss-idle/shared/multiplayer';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';

import Glyph from './Glyph';

/** One match in the lobby list. */
export default function MatchRow({ match, players, onClick }: {
	match: Match,
	players: Map<number, PresenceEntry>,
	onClick: () => void,
}) {
	const seated = matchPlayers(match);
	const ranks = seated.map(s => players.get(s.characterId)?.rank);
	const known = ranks.filter((r): r is number => r !== undefined);
	const rank = (r: number | undefined) => r === undefined ? '?' : bignum(r);
	const low = known.length ? Math.min(...known) : undefined;
	const high = known.length < ranks.length || !known.length ? undefined : Math.max(...known);
	const host = players.get(match.hostId);
	const map = match.beatmap;

	return (
		<button type="button" className={`mp-row ${match.playing ? 'is-playing' : ''}`} onClick={onClick}>
			<div className="mp-row__mode">
				<Glyph name={match.locked ? 'lock' : 'pianoKeys'} className="mp-row__icon" />
				<div>
					<div className="mp-row__type"><Trans>osu!mania (head-to-head)</Trans></div>
					<div className="mp-row__stats">
						<span>{seated.length} / {matchSize(match)}</span>
						<span><Trans>rank: {ph({ best: rank(low) })} - {ph({ worst: rank(high) })}</Trans></span>
					</div>
				</div>
			</div>
			<img className="mp-row__host" src={host?.avatarUrl ?? GUEST_AVATAR_URL} alt="" />
			<div className="mp-row__info">
				<div className="mp-row__name">
					{match.name}
					{match.playing && <> <Trans>(In Progress)</Trans></>}
				</div>
				<div className="mp-row__map">
					{match.changingBeatmap && <Trans>Changing beatmap...</Trans>}
					{!match.changingBeatmap && map && `${map.artist} - ${map.title} [${map.version}]`}
				</div>
				<div className="mp-row__slots">
					{/* the host shows big on the left, its slot stays empty here */}
					{match.slots.filter(s => s.state !== 'locked').map((s, i) => {
						if (s.state !== 'player' || s.characterId === match.hostId) {
							return <span key={i} className="mp-row__slot is-open" />;
						}
						const avatar = players.get(s.characterId)?.avatarUrl ?? GUEST_AVATAR_URL;
						return <img key={i} className="mp-row__slot" src={avatar} alt="" />;
					})}
				</div>
			</div>
		</button>
	);
}
