import { useLingui } from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Playlist } from '../../db/schema/playlist';
import PlayQueue from '../../gameplay/playQueue';
import ContextMenu from '../ContextMenu';

type Props = {
	onClose: () => void;
};

/** Names a playlist and fills it with the queue in its order, each map at its
 *  locked rate, mods and repeat. */
export default function SaveQueuePrompt({ onClose }: Props) {
	const { t } = useLingui();
	const [name, setName] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const save = async () => {
		const trimmed = name.trim();
		const entries = PlayQueue.state.get()?.entries ?? [];
		if (!trimmed || !entries.length) return;
		onClose();
		// no twins, as in the playlist manager: an existing name is overwritten
		const existing = await Playlist.byName(trimmed);
		await existing?.clear();
		const playlist = existing ?? await Playlist.create(trimmed);
		for (const { beatmap, repeat } of entries) {
			await playlist.addBeatmap(beatmap.metadata.id, beatmap.lockedRate, beatmap.lockedMods, repeat);
		}
	};

	// the dock's backdrop-filter would pin a fixed overlay inside the dock
	return createPortal(
		<ContextMenu
			title={t`Save the queue as a playlist`}
			focus={inputRef}
			onClose={onClose}
			options={[
				{
					label: t`Save`, color: '#5aa02c', onClick: () => void save(),
				},
				{
					label: t`Cancel`, color: '#6b6b6b', onClick: onClose,
				},
			]}
		>
			<input
				ref={inputRef}
				className="ctxmenu__input"
				value={name}
				placeholder={t`Playlist name`}
				spellCheck={false}
				autoComplete="off"
				onChange={e => setName(e.target.value)}
				onClick={e => e.stopPropagation()}
				onKeyDown={e => { if (e.key === 'Enter') void save(); }}
			/>
		</ContextMenu>,
		document.body,
	);
}
