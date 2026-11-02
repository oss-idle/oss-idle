import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import Log from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	MAX_MATCH_NAME,
	MAX_MATCH_PASSWORD,
	MAX_SLOTS,
	MIN_SLOTS,
} from '@oss-idle/shared/multiplayer';

import Entities from '../../entity/entities';
import useKeyboardOwner, { LAYER } from '../../input/keyboardOwner';
import Multiplayer from '../../online/multiplayer';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import Dropdown from '../dropdown/Dropdown';
import Checkbox from '../options/controls/Checkbox';
import OverChat from './OverChat';

const SIZES = Array.from({ length: MAX_SLOTS - MIN_SLOTS + 1 }, (_, i) => i + MIN_SLOTS);

/** osu!'s "Create New Game..." dialog, over the lobby. */
export default function CreateMatch({ onClose }: { onClose: () => void }) {
	const { t } = useLingui();
	const [name, setName] = useState(() =>
		t`${ph({ name: Entities.character.get()?.name ?? '' })}'s game`);
	const [password, setPassword] = useState('');
	const nameRef = useRef<HTMLInputElement>(null);
	// OverChat's layer: this runs outside it
	useKeyboardOwner(nameRef, {
		layer: LAYER.OVER_CHAT, close: onClose, 
	});
	const [usePassword] = useState(() => new Synced(false));
	const [isPublic] = useState(() => new Synced(true));
	const [size] = useState(() => new Synced(8));
	const [locked] = useSynced(usePassword);

	// only a password-protected game may keep its history to its players
	const start = async () => {
		if (!name.trim()) return;
		if (locked && !password) {
			Log.popup(t`Enter a password before attempting to start the game...`);
			return;
		}
		const historyPublic = !locked || isPublic.get();
		const pass = locked ? password : '';
		const reason = await Multiplayer.create(name.trim(), pass, size.get(), historyPublic);
		if (!reason) SceneManager.set(SCENE.MATCH);
	};

	return (
		<OverChat><div className="ctxmenu mp-create">
			<div className="ctxmenu__header"><Trans>Create New Game...</Trans></div>
			<div className="mp-create__form">
				<label className="mp-create__label" htmlFor="mp-name"><Trans>Game Name:</Trans></label>
				<input
					id="mp-name"
					ref={nameRef}
					className="mp-input"
					value={name}
					maxLength={MAX_MATCH_NAME}
					onChange={e => setName(e.target.value)}
				/>
				<div className="mp-create__checks">
					<Checkbox value={usePassword} label={<Trans>Require password to join</Trans>} />
					<Checkbox
						value={isPublic}
						disabled={!locked}
						label={<Trans>Make match history publicly viewable</Trans>}
					/>
				</div>
				<label className="mp-create__label" htmlFor="mp-password"><Trans>Password:</Trans></label>
				<input
					id="mp-password"
					className="mp-input"
					type="password"
					value={password}
					maxLength={MAX_MATCH_PASSWORD}
					disabled={!locked}
					onChange={e => setPassword(e.target.value)}
				/>
				<span className="mp-create__label"><Trans>Max Players:</Trans></span>
				<Dropdown
					className="mp-create__size"
					value={size}
					options={SIZES.map(n => ({
						value: n, label: plural(ph({ n }), {
							one: '# player', other: '# players', 
						}),
					}))}
				/>
			</div>
			<div className="ctxmenu__options">
				<button
					type="button"
					className="ctxmenu__option"
					style={{ '--accent': '#5aa02c' } as React.CSSProperties}
					onClick={() => void start()}
				>
					1. <Trans>Start Game</Trans>
				</button>
				<button
					type="button"
					className="ctxmenu__option"
					style={{ '--accent': '#6b6b6b' } as React.CSSProperties}
					onClick={onClose}
				>
					2. <Trans>Cancel</Trans>
				</button>
			</div>
		</div></OverChat>
	);
}
