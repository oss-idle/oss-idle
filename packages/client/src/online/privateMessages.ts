import type { PrivateMessage as Message } from '@oss-idle/shared/community/wire';
import Log, { POPUP_TYPE } from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';

import { uiSound } from '../audio/uiSounds';
import { plainText } from '../components/community/chat/links';
import {
	activeChatTab,
	chatTabs,
	pmContact,
	pmTab,
} from '../components/community/chat/state';
import { showChat } from '../components/community/state';
import PrivateMessage from '../db/schema/private_message';
import { isCommunityOpen } from '../globals';
import Auth from './auth';
import { rpc } from './client';
import Socket from './socket';

/** A conversation line, as the chat renders it. */
export type PmLine = {
	id: string,
	fromId: number,
	name: string,
	color: string,
	text: string,
	at: number,
};

/** Loaded conversations, by contact user id. A contact is loaded from the local
 *  history the first time its tab opens, then kept up to date live. */
export const conversations = new Synced<ReadonlyMap<number, PmLine[]>>(new Map());
/** The name each contact's tab shows. */
export const contactNames = new Synced<ReadonlyMap<number, string>>(new Map());

const me = (): number | undefined => Auth.user.get()?.id;

const toLine = (m: Message): PmLine => ({
	id: m.id,
	fromId: m.from.userId,
	name: m.from.name,
	color: m.from.color,
	text: m.text,
	at: m.at,
});

const setName = (contact: number, name: string) => {
	if (contactNames.get().get(contact) === name) return;
	void contactNames.set(new Map(contactNames.get()).set(contact, name));
};

const load = async (contact: number): Promise<void> => {
	const account = me();
	if (account === undefined || conversations.get().has(contact)) return;
	const rows = await PrivateMessage.conversation(account, contact);
	// a message that arrived while the history was being read is already in
	const live = conversations.get().get(contact) ?? [];
	const seen = new Set(rows.map(r => r.id));
	void conversations.set(new Map(conversations.get()).set(contact, [
		...rows.map(r => ({
			id: r.id, fromId: r.fromId, name: r.name, color: r.color, text: r.text, at: r.at,
		})),
		...live.filter(l => !seen.has(l.id)),
	]));
};

const addTab = (contact: number) => {
	const tab = pmTab(contact);
	if (!chatTabs.get().includes(tab)) void chatTabs.set([...chatTabs.get(), tab]);
};

/** Open (or bring up) the conversation with a player: its chat tab, in the F9
 *  overlay with the chat shown. */
export const openConversation = async (contact: number, name: string): Promise<void> => {
	setName(contact, name);
	await load(contact);
	addTab(contact);
	void activeChatTab.set(pmTab(contact));
	void isCommunityOpen.set(true);
	void showChat.set(true);
};

export const sendPm = (to: number, text: string): void => {
	Socket.send({
		type: 'pm', to, text,
	});
};

const isShowing = (contact: number): boolean =>
	isCommunityOpen.get() && showChat.get() && activeChatTab.get() === pmTab(contact);

Socket.on('pm', async ({ message }) => {
	const account = me();
	if (account === undefined) return;
	const incoming = message.from.userId !== account;
	const contact = incoming ? message.from.userId : message.to;

	await PrivateMessage.save(account, contact, message);
	if (incoming) setName(contact, message.from.name);
	const lines = conversations.get().get(contact);
	if (lines) void conversations.set(
		new Map(conversations.get()).set(contact, [...lines, toLine(message)]),
	);
	else await load(contact);

	if (!incoming) return;
	addTab(contact);
	if (isShowing(contact)) return;
	uiSound('ui/notification-mention');
	Log.popup(
		`${message.from.name}: ${plainText(message.text)}`,
		POPUP_TYPE.chat,
		false,
		() => void openConversation(contact, message.from.name),
	);
});

/** "Receive messages from anyone": unticked, only the people you added can. Kept
 *  on the server, which is what enforces it. */
export const pmFromAnyone = new Synced(true);
// what the server holds; only a change from it is written back
let stored: boolean | undefined;
let account: number | undefined;

void Auth.user.sync(async user => {
	if (user?.id === account) return;
	account = user?.id;
	stored = undefined;
	void conversations.set(new Map());
	void chatTabs.set(chatTabs.get().filter(tab => pmContact(tab) === undefined));
	if (!user) return;
	const res = await rpc.v1.social.settings.$get();
	if (!res.ok) return;
	const { pmFromAnyone: value } = await res.json();
	stored = value;
	await pmFromAnyone.set(value);
});

void pmFromAnyone.sync(async value => {
	if (stored === undefined || value === stored) return;
	stored = value;
	const res = await rpc.v1.social.settings.$put({ json: { pmFromAnyone: value } });
	if (!res.ok) Log.errorPopup(`Could not save the setting (${res.status})`);
});
