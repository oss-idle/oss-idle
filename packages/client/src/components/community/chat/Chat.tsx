import './Chat.css';

import { useLingui } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { isMatchChannel } from '@oss-idle/shared/multiplayer';

import { isCommunityOpen } from '../../../globals';
import useKeyboardOwner from '../../../input/keyboardOwner';
import { contactNames } from '../../../online/privateMessages';
import Tabs, { Tab } from '../../tabs/Tabs';
import { showChat } from '../state';
import ChatTabContents from './ChatTabContents';
import {
	activeChatTab,
	channelPickerOpen,
	chatTabs,
	pmContact,
	stepChatTab,
} from './state';
import { unreadTabs } from './unread';

export default function Chat() {
	const { t } = useLingui();
	const [channels = []] = useSynced(chatTabs);
	const [activeId] = useSynced(activeChatTab);
	const [names = new Map<number, string>()] = useSynced(contactNames);
	const [unread = new Set<string>()] = useSynced(unreadTabs);
	const inputRef = useRef<HTMLInputElement>(null);

	// osu! behaviour: clicking anywhere in the chat focuses the compose input
	const focusInput = () => {
		inputRef.current?.focus();
	};

	const [open] = useSynced(isCommunityOpen);
	const [shown = true] = useSynced(showChat);
	useKeyboardOwner(inputRef, { active: open && shown });

	// Ctrl+Tab / Ctrl+Shift+Tab: the next or previous tab (browsers keep it for their own tabs)
	useEffect(() => {
		if (!open || !shown) return;
		// on the way in: the compose box's name and emoji completion take a plain Tab and stop it
		const onKey = (e: KeyboardEvent) => {
			if (!e.ctrlKey || e.key !== 'Tab') return;
			e.preventDefault();
			e.stopPropagation();
			stepChatTab(e.shiftKey ? -1 : 1);
		};
		window.addEventListener('keydown', onKey, { capture: true });
		return () => window.removeEventListener('keydown', onKey, { capture: true });
	}, [open, shown]);

	const closeChannel = (channel: string) => {
		void chatTabs.set(channels.filter(c => c !== channel));
	};

	// a span, not a button: the tab label already sits inside the Tabs <button>,
	// and nested buttons are invalid DOM
	const ChatTabButton = ({ channel } : { channel: string }) => <>
		{pmContact(channel) !== undefined
			? names.get(pmContact(channel)!) ?? channel
			: isMatchChannel(channel) ? '#multiplayer' : channel}
		<span
			role="button"
			className="chat__close"
			aria-label={t`Close channel`}
			onClick={e => {
				e.stopPropagation();
				closeChannel(channel);
			}}
		/>
	</>;

	const tabs: Tab[] = channels.map(channel => ({
		id: channel,
		label: <ChatTabButton channel={channel} />,
		className: unread.has(channel) ? undefined : 'read',
		render: () => <ChatTabContents key={channel} channel={channel} inputRef={inputRef} />,
	}));

	return (
		<div className="chat" onClick={focusInput}>
			<div className="chat__tabs">
				<Tabs tabs={tabs} active={activeChatTab} />
				<button
					className="chat__add"
					aria-label={t`Join a channel`}
					onClick={e => {
						e.stopPropagation();
						void channelPickerOpen.set(true);
					}}
				/>
			</div>
			{tabs.find(t => t.id === activeId)?.render()}
		</div>
	);
}
