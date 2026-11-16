import { randomUUID } from 'node:crypto';

import type {
	ChatLine,
	PrivateMessage,
} from '@oss-idle/shared/community/wire';
import {
	GROUP_BADGE,
	MAKISEBOT_ID,
	MAKISEBOT_USER_ID,
} from '@oss-idle/shared/groups';

/** MakiseBot, our BanchoBot, speaks in pink. */
export const BOT_COLOR = GROUP_BADGE.bot.colour;

const NAME = 'MakiseBot';

type SystemLine = Extract<ChatLine, { kind: 'system' }>;

/** A line MakiseBot says in a channel; her name opens her menu. */
export const botLine = (channel: string, text: string, link?: SystemLine['link']): SystemLine => ({
	id: randomUUID(),
	kind: 'system',
	channel,
	name: NAME,
	from: {
		characterId: MAKISEBOT_ID, userId: MAKISEBOT_USER_ID,
	},
	color: BOT_COLOR,
	text,
	...link && { link },
	at: Date.now(),
});

/** A private message from MakiseBot to an account. */
export const botPm = (to: number, text: string): PrivateMessage => ({
	id: randomUUID(),
	from: {
		userId: MAKISEBOT_USER_ID, characterId: MAKISEBOT_ID, name: NAME, color: BOT_COLOR,
	},
	to,
	text,
	at: Date.now(),
});
