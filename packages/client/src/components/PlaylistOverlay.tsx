import './PlaylistOverlay.css';

import { ph } from '@lingui/core/macro';
import {
	Plural,
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { lockLabel } from '@oss-idle/shared/mods';

import {
	getPlaylistIndex,
	Playlist,
	playlistsVersion,
} from '../db/schema/playlist';
import { selectedMods } from '../gameplay/playMods';
import {
	canPlayAt,
	liveSpeedUpgrades,
	selectedRate,
} from '../gameplay/playRate';
import useKeyboardOwner from '../input/keyboardOwner';
import LightBeatmap from '../osu/beatmap/LightBeatmap';

type Props = {
	/** the right-clicked difficulty the +/- buttons act on */
	beatmap: LightBeatmap;
	onClose: () => void;
};

/**
 * The playlist manager, modelled on osu!'s collections dialog: a text box that
 * creates a playlist on Enter, the list of existing playlists with rename and
 * add/remove-this-difficulty controls, and a delete (with an inline two-step
 * confirm) for the highlighted playlist.
 */
export default function PlaylistOverlay({ beatmap, onClose }: Props) {
	const { t } = useLingui();
	const createRef = useRef<HTMLInputElement>(null);
	useKeyboardOwner(createRef, { close: onClose });
	const [version] = useSynced(playlistsVersion);
	const index = useAsync(() => getPlaylistIndex(), [version]);
	const [rate] = useSynced(selectedRate);
	const [mods] = useSynced(selectedMods);
	const lock = lockLabel(rate, mods);
	useSynced(liveSpeedUpgrades);

	const [name, setName] = useState('');
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [renamingId, setRenamingId] = useState<number | null>(null);
	const [renameText, setRenameText] = useState('');
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const beatmapId = beatmap.metadata.id;
	const selected = index?.playlists.find((p) => p.id === selectedId);

	const create = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		// names are the player-facing identity: re-entering an existing one
		// selects it instead of silently creating a twin
		const existing = await Playlist.byName(trimmed);
		const p = existing ?? await Playlist.create(trimmed);
		setSelectedId(p.id);
		setName('');
	};

	const commitRename = async (p: Playlist) => {
		const trimmed = renameText.trim();
		setRenamingId(null);
		if (!trimmed || trimmed === p.name) return;
		await p.rename(trimmed);
	};

	const select = (id: number) => {
		setSelectedId(id);
		setConfirmingDelete(false);
	};

	const deleteSelected = async () => {
		if (!selected) return;
		if (!confirmingDelete) {
			setConfirmingDelete(true);
			return;
		}
		setConfirmingDelete(false);
		setSelectedId(null);
		await selected.deleteWithEntries();
	};

	return (
		<div className="plmgr" onClick={onClose}>
			<div className="plmgr__heading"><Trans>Playlists</Trans></div>
			<div className="plmgr__panel" onClick={(e) => e.stopPropagation()}>
				<input
					ref={createRef}
					className="plmgr__create"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
					placeholder={t`Select a playlist or create a new one here...`}
					spellCheck={false}
					autoComplete="off"
				/>

				<div className="plmgr__list">
					{index?.playlists.length === 0 && (
						<div className="plmgr__empty">
							<Trans>No playlists yet. Type a name above and press Enter.</Trans>
						</div>
					)}
					{index?.playlists.map((p) => {
						const entries = index.byBeatmap
							.get(beatmapId)
							?.filter((x) => x.id === p.id) ?? [];
						const contains = entries.some((x) => x.rate === undefined);
						const locked = [...new Map(entries.flatMap((x) => x.rate === undefined ? [] : [
							[lockLabel(x.rate, x.mods), {
								rate: x.rate, mods: x.mods,
							}] as const,
						])).entries()].sort(([, a], [, b]) => a.rate - b.rate);
						const nbMaps = index.counts.get(p.id) ?? 0;
						return (
							<div
								key={p.id}
								className={`plmgr__row ${p.id === selectedId ? 'is-selected' : ''}`}
								onClick={() => select(p.id)}
							>
								{renamingId === p.id ? (
									<input
										className="plmgr__rename"
										value={renameText}
										onChange={(e) => setRenameText(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') void commitRename(p);
											if (e.key === 'Escape') { e.stopPropagation(); setRenamingId(null); }
										}}
										onBlur={() => void commitRename(p)}
										spellCheck={false}
										autoFocus
									/>
								) : (
									<span className="plmgr__name">
										{p.name}
										<span className="plmgr__count"><Plural value={nbMaps} one='# map' other='# maps' /></span>
									</span>
								)}
								<span className="plmgr__actions">
									{locked.map(([label, l]) => (
										<button
											key={label}
											type="button"
											className={`plmgr__btn plmgr__btn--remove ${canPlayAt(l.rate) ? '' : 'plmgr__btn--unreachable'}`}
											title={t`Remove this difficulty at ${ph({ rate: label })}`}
											onClick={(e) => { e.stopPropagation(); void p.removeBeatmap(beatmapId, l.rate, l.mods); }}
										>
											{label}
										</button>
									))}
									<button
										type="button"
										className="plmgr__btn"
										title={t`Rename`}
										onClick={(e) => { 
											e.stopPropagation(); 
											setRenamingId(p.id); 
											setRenameText(p.name); 
										}}
									>
										<Trans>Rename</Trans>
									</button>
									<button
										type="button"
										className="plmgr__btn plmgr__btn--add"
										title={t`Add this difficulty`}
										disabled={contains}
										onClick={(e) => { e.stopPropagation(); void p.addBeatmap(beatmapId); }}
									>
										+
									</button>
									<button
										type="button"
										className="plmgr__btn plmgr__btn--add"
										title={t`Add this difficulty locked at ${ph({ rate: lock })}`}
										disabled={locked.some(([label]) => label === lock)}
										onClick={(e) => { e.stopPropagation(); void p.addBeatmap(beatmapId, rate, mods); }}
									>
										+ {lock}
									</button>
									<button
										type="button"
										className="plmgr__btn plmgr__btn--remove"
										title={t`Remove this difficulty`}
										disabled={!contains}
										onClick={(e) => { e.stopPropagation(); void p.removeBeatmap(beatmapId); }}
									>
										-
									</button>
								</span>
							</div>
						);
					})}
				</div>

				<div className="plmgr__footer">
					<button
						type="button"
						className="plmgr__action plmgr__action--delete"
						disabled={!selected}
						onClick={() => void deleteSelected()}
					>
						{confirmingDelete ? 
							t`Really delete "${ph({ playlist: selected?.name ?? '' })}"?` 
							: t`Delete the playlist`
						}
					</button>
					<button type="button" className="plmgr__action" onClick={onClose}>
						<Trans>Close</Trans>
					</button>
				</div>
			</div>
		</div>
	);
}
