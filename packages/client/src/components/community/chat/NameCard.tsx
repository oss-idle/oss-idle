import {
	ph,
	t,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import accuracyText from '@oss-idle/shared/display/accuracy';
import { statusName } from '@oss-idle/shared/display/community';
import { countryName } from '@oss-idle/shared/display/country';
import num, { bignum } from '@oss-idle/shared/display/num';
import {
	rankTier,
	rankTierGradient,
} from '@oss-idle/shared/display/rankTier';

import Marquee from '../../Marquee';
import NameCardFlag from './NameCardFlag';
import NameCardFriends from './NameCardFriends';

/** A player's card, after osu!'s user panel; friend buttons only with `friendship`. */
export default function NameCard({ p, offline = false, color, bannerUrl, friendship }: {
	p: PresenceEntry,
	offline?: boolean,
	color?: string,
	bannerUrl?: string,
	friendship?: { friend: boolean, mutual: boolean },
}) {
	const { i18n } = useLingui();
	const tier = rankTier(p.rank, p.rankPercent);
	const pp = num(Math.round(p.pp));
	const playing = !offline && p.status === 'playing' && p.nowPlaying;
	return (<>
		{bannerUrl && <div className="name-card__bg" style={{ backgroundImage: `url("${bannerUrl}")` }} />}
		<img className="name-card__avatar" src={p.avatarUrl} alt="" />
		<div className="name-card__body">
			<div className="name-card__top">
				<b className="name-card__name" style={{ color }}>{p.name}</b>
				{friendship && <NameCardFriends userId={p.userId} {...friendship} />}
			</div>
			<div className="name-card__where">
				<NameCardFlag country={p.country} />
				<span className="name-card__country">{countryName(p.country, i18n.locale)}</span>
				{p.rank ? (
					<span
						className="name-card__rank"
						style={tier ? { backgroundImage: rankTierGradient(tier) } : undefined}
					>#{bignum(p.rank)}</span>
				) : undefined}
			</div>
			<div className="name-card__status" data-status={offline ? 'offline' : p.status}>
				{playing && <span className="name-card__play">▶</span>}
				<Marquee className="name-card__marquee">
					{playing || (offline ? t`Offline` : statusName(p.status))}
				</Marquee>
			</div>
			<div className="name-card__stats">
				<span><b>{pp}</b>pp</span>
				<span><b>{accuracyText(p.accuracy)}</b></span>
				<span><Trans>Lv<b>{ph({ level: p.level })}</b></Trans></span>
			</div>
		</div>
	</>);
}
