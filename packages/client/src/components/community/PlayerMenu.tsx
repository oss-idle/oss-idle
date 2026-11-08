import './PlayerMenu.css';

import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import Log from '@oss-idle/shared/helpers/log';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import {
	isWebOpen,
	webUrl,
} from '../../globals';
import Auth from '../../online/auth';
import {
	addFriend,
	friends,
	removeFriend,
} from '../../online/friends';
import Multiplayer from '../../online/multiplayer';
import { openConversation } from '../../online/privateMessages';
import Socket from '../../online/socket';
import ContextMenu, { type ContextMenuOption } from '../ContextMenu';
import ReportMessageDialog from './chat/ReportMessageDialog';
import PlayerCard from './PlayerCard';
import {
	menuFor,
	type MenuTarget,
} from './state';

/** What the host of our match can do to another player in it. */
const hostActions = (
	characterId: number,
	close: () => void,
	labels: { give: string, kick: string },
): ContextMenuOption[] => {
	const match = Multiplayer.current.get();
	const seated = match?.slots.some(s => s.state === 'player' && s.characterId === characterId);
	if (!match || !seated || !Multiplayer.isHost(match) || characterId === match.hostId) return [];
	return [
		{
			label: labels.give,
			color: '#d9a400',
			onClick: () => {
				close();
				Multiplayer.send({
					type: 'mp:host', characterId,
				});
			},
		},
		{
			label: labels.kick,
			color: '#e93100',
			onClick: () => {
				close();
				Multiplayer.send({
					type: 'mp:kick', characterId,
				});
			},
		},
	];
};

/** osu!'s interaction menu for a clicked roster card or chat name. */
export default function PlayerMenu() {
	const { t } = useLingui();
	const [player] = useSynced(menuFor);
	const [user] = useSynced(Auth.user);
	const [friendIds = new Set<number>()] = useSynced(friends);
	const [roster = []] = useSynced(Socket.presence);
	// keyed to the menu it came from: Esc can clear the menu without close()
	const [reporting, setReporting] = useState<MenuTarget>();
	if (!player) return null;

	const close = () => void menuFor.set(undefined);
	if (reporting === player && player.line) {
		return <ReportMessageDialog line={player.line} onClose={close} />;
	}

	// a chat sender may have gone offline since: no card then, just their name
	const card = roster.find(p => p.characterId === player.characterId);
	const isSelf = user?.id === player.userId;
	const isFriend = friendIds.has(player.userId);

	const toggleFriend = async () => {
		close();
		try {
			if (isFriend) await removeFriend(player.userId);
			else await addFriend(player.userId);
		} catch (e) {
			Log.errorPopup(String(e));
		}
	};

	const options: ContextMenuOption[] = [
		{
			label: t`View Profile`,
			color: '#2f5f9a',
			onClick: () => {
				close();
				void webUrl.set(`c/${player.characterId}`);
				void isWebOpen.set(true);
			},
		},
		...isSelf ? [] : [
			{
				label: t`Start Chat`,
				color: '#7d5cc6',
				onClick: () => {
					close();
					void openConversation(player.userId, player.name);
				},
			},
			{
				label: isFriend ? t`Revoke Friendship` : t`Add as Friend`,
				color: '#e6a6b6',
				onClick: () => void toggleFriend(),
			},
			...player.line ? [{
				label: t`Report`,
				color: '#d64045',
				onClick: () => setReporting(player),
			}] : [],
		],
		...hostActions(player.characterId, close, {
			give: t`Give Host`, kick: t`Kick`,
		}),
		{
			label: t`Close`,
			color: '#9a9a9a',
			onClick: close,
		},
	];

	return (
		<ContextMenu
			title={player.name}
			header={card && <PlayerCard character={card} className="player-menu__card" />}
			onClose={close}
			options={options}
		/>
	);
}
