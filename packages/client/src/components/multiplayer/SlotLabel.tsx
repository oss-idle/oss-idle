import { Trans } from '@lingui/react/macro';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import { bignum } from '@oss-idle/shared/display/num';
import { playLabel } from '@oss-idle/shared/mods';
import type { MatchSlot } from '@oss-idle/shared/multiplayer';

/** What a seat reads: Open, Locked, or the player and their state. */
export default function SlotLabel({ slot, player }: {
	slot: MatchSlot,
	player?: PresenceEntry,
}) {
	if (slot.state === 'open') return <Trans>Open</Trans>;
	if (slot.state === 'locked') return <Trans>Locked</Trans>;
	const active = playLabel(slot.mods ?? [], slot.rate ?? 1);
	return <>
		{player?.name ?? '...'}
		{slot.playing && <> <Trans>[playing]</Trans></>}
		{!slot.playing && slot.noMap && <> <Trans>[no map]</Trans></>}
		{active && <span className="mp-slot__rate">{active}</span>}
		{player?.rank !== undefined && (
			<span className="mp-slot__rank">#{bignum(player.rank)}</span>
		)}
	</>;
}
