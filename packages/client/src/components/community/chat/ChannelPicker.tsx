import './ChannelPicker.css';

import { useLingui } from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import {
	ANNOUNCE_CHANNEL,
	DEFAULT_CHANNEL,
	TEAM_CHANNEL,
} from '@oss-idle/shared/community/wire';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { LOBBY_CHANNEL } from '@oss-idle/shared/multiplayer';

import { LOGS_CHANNEL } from '../../../logs';
import Auth from '../../../online/auth';
import ContextMenu from '../../ContextMenu';
import {
	activeChatTab,
	channelPickerOpen,
	chatTabs,
} from './state';

const CHANNELS = [DEFAULT_CHANNEL, ANNOUNCE_CHANNEL, LOBBY_CHANNEL, LOGS_CHANNEL];

/** osu!'s channel list, behind the chat tabs' + button: a click joins a channel or leaves it. */
export default function ChannelPicker() {
	const { t } = useLingui();
	const [open] = useSynced(channelPickerOpen);
	const [tabs = []] = useSynced(chatTabs);
	const [user] = useSynced(Auth.user);
	const [search, setSearch] = useState('');
	const searchRef = useRef<HTMLInputElement>(null);
	if (!open) return null;

	const topics: Record<string, string> = {
		[DEFAULT_CHANNEL]: t`The main oss!idle channel.`,
		[ANNOUNCE_CHANNEL]: t`Automated announcements of stuff going on in oss!idle.`,
		[LOBBY_CHANNEL]: t`Talk about multiplayer games.`,
		[LOGS_CHANNEL]: t`Your own plays and level-ups, seen only by you.`,
		[TEAM_CHANNEL]: t`The Administrators' and Global Moderation Team's channel.`,
	};
	const query = search.toLowerCase();
	const channels = user?.groups?.length ? [...CHANNELS, TEAM_CHANNEL] : CHANNELS;
	const shown = channels.filter(c => `${c} ${topics[c]}`.toLowerCase().includes(query));

	const close = () => {
		void channelPickerOpen.set(false);
		setSearch('');
	};
	const toggle = (channel: string) => {
		if (tabs.includes(channel)) {
			void chatTabs.set(tabs.filter(c => c !== channel));
			return;
		}
		void chatTabs.set([...tabs, channel]);
		void activeChatTab.set(channel);
	};

	return (
		<ContextMenu
			focus={searchRef}
			header={<>
				<div className="ctxmenu__title">{t`Select any channel you wish to join!`}</div>
				<label className="channels__search" onClick={e => e.stopPropagation()}>
					{t`Search:`}
					<input
						ref={searchRef}
						type="text"
						value={search}
						onChange={e => setSearch(e.target.value)}
					/>
				</label>
			</>}
			onClose={close}
			options={[
				{
					label: t`Close`, color: '#d5627a', onClick: close,
				},
			]}
		>
			<div className="channels">
				{shown.map(channel => (
					<button
						key={channel}
						type="button"
						className={`channels__row ${tabs.includes(channel) ? 'is-joined' : ''}`}
						// typing keeps going to the search
						onMouseDown={e => e.preventDefault()}
						onClick={e => {
							e.stopPropagation();
							toggle(channel);
						}}
					>
						<span className="channels__name">{channel}</span>
						<span>{topics[channel]}</span>
					</button>
				))}
			</div>
		</ContextMenu>
	);
}
