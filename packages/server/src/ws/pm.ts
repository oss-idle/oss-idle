import { randomUUID } from 'node:crypto';

import { makiseBotReply } from '@oss-idle/shared/community/makiseBot';
import {
	MAX_CHAT_LENGTH,
	type PrivateMessage,
} from '@oss-idle/shared/community/wire';
import {
	AMADEUS_USER_ID,
	MAKISEBOT_USER_ID,
} from '@oss-idle/shared/groups';

import { getUserById } from '../db/schema/user';
import {
	blockedEitherWay,
	follows,
} from '../social';
import {
	isMuted,
	nameColor,
	rateLimited,
} from './chat';
import { hub } from './hub';
import { botPm } from './makiseBot';
import { areOnline } from './presence';

/** Whether `to` takes this message: online, no block either way, and - if they
 *  only take messages from the people they added - `from` is one of them. */
const deliverable = async (fromUserId: number, to: number): Promise<number | undefined> => {
	const recipient = await getUserById(to);
	const characterId = recipient?.currentCharacter;
	if (!recipient || !characterId) return undefined;
	const [[online], blocked, accepted] = await Promise.all([
		areOnline([characterId]),
		blockedEitherWay(fromUserId, to),
		recipient.pmFromAnyone || follows(to, fromUserId),
	]);
	return online && !blocked && accepted ? characterId : undefined;
};

/** Whether this message goes out at all: the sender isn't muted or over the rate
 *  limit, and the recipient takes it. */
const recipientOf = async (
	from: PrivateMessage['from'], to: number,
): Promise<number | undefined> => {
	if (await isMuted(from.userId) || await rateLimited(from.characterId, 'pm')) return undefined;
	return deliverable(from.userId, to);
};

/** MakiseBot answers her commands in private, past the same mute and rate limit. */
const answerPm = async (from: PrivateMessage['from'], text: string): Promise<void> => {
	if (await isMuted(from.userId) || await rateLimited(from.characterId, 'pm')) return;
	const reply = makiseBotReply(text, from.name);
	if (reply !== undefined) hub.sendTo(from.characterId, {
		type: 'pm', message: botPm(from.userId, reply),
	});
};

/** Amadeus plays by itself on stream and reads no message: every one gets this back. */
const AMADEUS_ANSWER = 'I am played by Twitch chat, so I cannot read this. Come and steer me: https://www.twitch.tv/adri_osu';

/** Amadeus's one answer, past the same mute and rate limit. Nothing reaches its own client. */
const answerForAmadeus = async (from: PrivateMessage['from']): Promise<void> => {
	if (await isMuted(from.userId) || await rateLimited(from.characterId, 'pm')) return;
	const characterId = (await getUserById(AMADEUS_USER_ID))?.currentCharacter;
	if (!characterId) return;
	hub.sendTo(from.characterId, {
		type: 'pm',
		message: {
			id: randomUUID(),
			from: {
				userId: AMADEUS_USER_ID, characterId, name: 'Amadeus', color: await nameColor(AMADEUS_USER_ID),
			},
			to: from.userId,
			text: AMADEUS_ANSWER,
			at: Date.now(),
		},
	});
};

/**
 * Relay one private message. Nothing is stored. The sender always gets it back
 * as if delivered, whatever stopped it: mute, the rate limit, an offline
 * recipient, one who doesn't take their messages, or a block.
 */
export const handlePm = async (
	from: PrivateMessage['from'],
	to: number,
	text: string,
): Promise<void> => {
	const trimmed = text.trim();
	if (!trimmed || to === from.userId) return;

	const message: PrivateMessage = {
		id: randomUUID(),
		from,
		to,
		text: trimmed.slice(0, MAX_CHAT_LENGTH),
		at: Date.now(),
	};
	hub.sendTo(from.characterId, {
		type: 'pm', message,
	});
	if (to === MAKISEBOT_USER_ID) return answerPm(from, message.text);
	if (to === AMADEUS_USER_ID) return answerForAmadeus(from);
	const recipient = await recipientOf(from, to);
	if (recipient !== undefined) hub.sendTo(recipient, {
		type: 'pm', message,
	});
};
