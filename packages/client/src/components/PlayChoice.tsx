import './PlayChoice.css';

import { faDesktop } from '@fortawesome/free-solid-svg-icons/faDesktop';
import { faGlobe } from '@fortawesome/free-solid-svg-icons/faGlobe';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { isPlayChoiceOpen } from '../globals';
import useKeyboardOwner, { LAYER } from '../input/keyboardOwner';
import Account from '../online/account';
import Auth from '../online/auth';
import SceneManager, { SCENE } from '../scenes/SceneManager';
import PlayChoiceCard from './PlayChoiceCard';

const close = () => void isPlayChoiceOpen.set(false);

/**
 * Asked on the first play on a device with no character: a local character, or
 * an online one. A local character can never move online.
 */
export default function PlayChoice() {
	const [open] = useSynced(isPlayChoiceOpen);
	const [noCharacter] = useSynced(Account.noCharacter);
	const [busy, setBusy] = useState(false);
	const shown = open && noCharacter;
	useKeyboardOwner(undefined, {
		active: shown, layer: LAYER.PLAY_CHOICE, close,
	});
	if (!shown) return null;

	const playLocally = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await Account.playLocally();
			close();
			if (SceneManager.current.get() === SCENE.MENU) SceneManager.set(SCENE.SELECT);
		} finally {
			setBusy(false);
		}
	};

	const signIn = () => {
		close();
		Auth.signIn();
	};

	return (
		<div className="play-choice" onClick={close}>
			<h1 className="play-choice__title"><Trans>How do you want to play?</Trans></h1>
			<div className="play-choice__cards" onClick={e => e.stopPropagation()}>
				<PlayChoiceCard
					icon={faDesktop}
					title={<Trans>Play locally</Trans>}
					text={<Trans>No account. Your character stays on this device.</Trans>}
					warning={<Trans>It can never be moved online.</Trans>}
					button={<Trans>Play locally</Trans>}
					accent="blue"
					disabled={busy}
					onPick={() => void playLocally()}
				/>
				<PlayChoiceCard
					icon={faGlobe}
					title={<Trans>Play online</Trans>}
					text={<Trans>Leaderboards, multiplayer, one character on every device.</Trans>}
					button={<Trans>Sign in with osu!</Trans>}
					accent="pink"
					onPick={signIn}
				/>
			</div>
			<button className="play-choice__back" onClick={close}>
				‹ <Trans>Back</Trans>
			</button>
		</div>
	);
}
