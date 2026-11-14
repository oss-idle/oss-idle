import { t } from '@lingui/core/macro';

import {
	ANNOUNCE_CHANNEL,
	type ChatLine,
} from '@oss-idle/shared/community/wire';
import Log, { POPUP_TYPE } from '@oss-idle/shared/helpers/log';

import { playPing } from '../../../audio/ping';
import { Setting } from '../../../db/settings';
import Entities from '../../../entity/entities';
import {
	isCommunityOpen,
	isStandalone,
} from '../../../globals';
import Auth from '../../../online/auth';
import { blocked } from '../../../online/blocks';
import Socket from '../../../online/socket';
import { showChat } from '../state';
import {
	mentionableText,
	plainText,
} from './links';
import {
	activeChatTab,
	chatTabs,
} from './state';

/** A mention you can't see plays a ping. */
export const mentionSound = new Setting('chat.mentionSound', true);
/** A mention while the game isn't in front shows a desktop notification. Off on the web until ticked,
 *  the click that asks the browser. */
export const mentionNotify = new Setting('chat.mentionNotify', isStandalone.get());

/** Whether notifications may show; the browser asks once, on a click. */
export const askNotifyPermission = async (): Promise<boolean> => {
	if (typeof Notification === 'undefined') return false;
	if (Notification.permission === 'default') await Notification.requestPermission();
	return Notification.permission === 'granted';
};

/** The sender's name colour on a line that mentions you. */
export const MENTION_COLOR = '#66ccff';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text names the signed-in character, as a whole word, outside its maps, addresses and
 *  `quiet` parts. */
export const mentionsMe = (text: string, quiet?: string[]): boolean => {
	if (!Auth.user.get()) return false;
	const name = Entities.character.get().name;
	return !!name
		&& new RegExp(`(?<![\\w])${escape(name)}(?![\\w])`, 'i').test(mentionableText(text, quiet));
};

const openChannel = (channel: string): void => {
	void activeChatTab.set(channel);
	void isCommunityOpen.set(true);
	void showChat.set(true);
};

/** The game is the window in front: not minimised, not behind another one. */
const inFront = (): boolean => !document.hidden && document.hasFocus();

/** On the desktop, outside the game: clicking it brings the game back on that channel. */
const notify = (title: string, text: string, channel: string, icon?: string): void => {
	if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
	try {
		const n = new Notification(title, {
			body: text, icon, tag: `mention:${channel}`,
		});
		n.onclick = () => {
			window.focus();
			openChannel(channel);
			n.close();
		};
	} catch {
		// a browser that only lets a service worker notify: the popup and ping still came
	}
};

/** The desktop notification for a mention, titled by who sent it. */
const notifyMention = (line: ChatLine, text: string): void => {
	const { channel } = line;
	if (line.kind !== 'player') return notify(t`You were mentioned in ${channel}`, text, channel);
	const { name, userId } = line.from;
	const avatar = Socket.presence.get()?.find(p => p.userId === userId)?.avatarUrl;
	notify(t`${name} mentioned you`, text, channel, avatar);
};

/** A line that mentions you in a channel you have open: someone else's (not blocked), or a server announcement. */
const mentionsYou = (line: ChatLine): boolean =>
	(line.kind === 'player'
		? line.from.userId !== Auth.user.get()?.id && !blocked.get().has(line.from.userId)
		: line.channel === ANNOUNCE_CHANNEL)
	&& chatTabs.get().includes(line.channel)
	&& mentionsMe(line.text, line.kind === 'system' ? line.quiet : undefined);

Socket.on('chat', ({ line }) => {
	if (!mentionsYou(line)) return;
	const watching = isCommunityOpen.get() && showChat.get() && activeChatTab.get() === line.channel;
	// reading that channel right now: you've seen it
	if (watching && inFront()) return;
	const text = plainText(line.text);
	if (mentionSound.get()) playPing();
	if (!inFront() && mentionNotify.get()) notifyMention(line, text);
	if (watching) return;
	Log.popup(
		line.kind === 'player' ? `${line.from.name}: ${text}` : text,
		POPUP_TYPE.chat,
		false,
		() => openChannel(line.channel),
	);
});
