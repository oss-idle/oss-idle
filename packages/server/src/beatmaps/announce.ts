import {
	type MapCover,
	mapCoverUrl,
} from '@oss-idle/shared/beatmap';

import { publish } from '../discord/publish';
import {
	apiBaseUrl,
	clientUrl,
	env,
	isProd,
} from '../env';

export type AnnounceSet = MapCover & {
	loved: boolean;
	artist: string;
	title: string;
	creator: string;
	difficulties: { version: string; sr: number }[];
};

/** Post the "now ranked" (or loved) embed to the map feed. Fires from the rank sweep when a
 *  scheduled map's date passes (not at upload), so each map announces once it's
 *  actually live, pinging the opt-in role for its status. No-op outside prod or without a configured webhook. */
export const announceRanked = async (set: AnnounceSet): Promise<void> => {
	if (!isProd || !env.MAP_FEED_WEBHOOK) return;

	const cover = mapCoverUrl(set, 'cover', apiBaseUrl);
	const asc = [...set.difficulties].sort((a, b) => a.sr - b.sr);
	const role = set.loved ? env.MAP_FEED_LOVED_ROLE_ID : env.MAP_FEED_ROLE_ID;

	await publish(env.MAP_FEED_WEBHOOK, {
		...role && {
			content: `<@&${role}>`, allowed_mentions: { roles: [role] }, 
		},
		embeds: [
			{
				title: `${set.artist} - ${set.title}`,
				url: `${clientUrl}/web/maps/${set.id}`,
				description: asc.map(d => `\`${d.sr.toFixed(2)}☆\` \`${d.version}\``).join('\n'),
				color: set.loved ? 16737962 : 5814783,
				author: { name: `New ${set.loved ? 'loved' : 'ranked'} map by ${set.creator}` },
				fields: [{
					name: set.loved ? 'Loved' : 'Ranked', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
				}],
				...cover && { image: { url: cover } },
			},
		],
		attachments: [],
	});
};
