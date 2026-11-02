import { ANNOUNCE_CHANNEL } from '@oss-idle/shared/community/wire';
import Synced from '@oss-idle/shared/helpers/synced';

import { isCommunityOpen } from '../../../globals';
import {
	logLines,
	LOGS_CHANNEL,
} from '../../../logs';
import Auth from '../../../online/auth';
import { blocked } from '../../../online/blocks';
import Socket from '../../../online/socket';
import { showChat } from '../state';
import {
	activeChatTab,
	chatTabs,
	pmTab,
} from './state';

/** Someone wrote while the chat was hidden: the chat button lights up. */
export const chatUnread = new Synced(false);

const hidden = (): boolean => !isCommunityOpen.get() || !showChat.get();

const received = (userId: number): void => {
	if (hidden() && userId !== Auth.user.get()?.id && !blocked.get().has(userId)) {
		void chatUnread.set(true);
	}
};

/** Tabs with lines not looked at yet; the others draw dark. */
export const unreadTabs = new Synced(new Set<string>());

const markUnread = (tab: string): void => {
	if (tab === activeChatTab.get() || unreadTabs.get().has(tab)) return;
	void unreadTabs.set(new Set(unreadTabs.get()).add(tab));
};

const unmark = (keep: (tab: string) => boolean): void => {
	const tabs = unreadTabs.get();
	if ([...tabs].every(keep)) return;
	void unreadTabs.set(new Set([...tabs].filter(keep)));
};
void activeChatTab.sync(active => unmark(tab => tab !== active));
void chatTabs.sync(open => unmark(tab => open.includes(tab)));

let lastLog = logLines.get().at(-1)?.id;
void logLines.sync(lines => {
	const last = lines.at(-1)?.id;
	if (last !== lastLog) markUnread(LOGS_CHANNEL);
	lastLog = last;
});

Socket.on('chat', ({ line }) => {
	if (line.kind === 'player' && blocked.get().has(line.from.userId)) return;
	markUnread(line.channel);
	if (line.kind !== 'player' || line.channel === ANNOUNCE_CHANNEL) return;
	if (chatTabs.get().includes(line.channel)) received(line.from.userId);
});
Socket.on('pm', ({ message }) => {
	const own = message.from.userId === Auth.user.get()?.id;
	if (!own && blocked.get().has(message.from.userId)) return;
	markUnread(pmTab(own ? message.to : message.from.userId));
	received(message.from.userId);
});

const seen = (): void => { if (!hidden()) void chatUnread.set(false); };
void isCommunityOpen.sync(seen);
void showChat.sync(seen);
