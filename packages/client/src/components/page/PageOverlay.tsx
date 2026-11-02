import './pageOverlay.css';

import {
	Suspense,
	useEffect,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { openPage } from '../../globals';
import Controls from '../../input/Controls';
import useKeyboardOwner, {
	KeyboardLayer,
	LAYER,
} from '../../input/keyboardOwner';
import Addons from '../../scenes/Addons';
import Character from '../../scenes/Character';
import Direct from '../../scenes/Direct';
import { SongSelect } from '../../scenes/lazy';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import Skins from '../../scenes/Skins';
import { toggleDirect } from '../direct/directState';

/**
 * Hosts the full-screen pages (skins / add-ons / character / the play queue)
 * above the active scene, so the scene underneath keeps its state - including a
 * play that is running. Stays mounted through the close animation.
 */
export default function PageOverlay() {
	const [state] = useSynced(openPage);
	const [scene] = useSynced(SceneManager.current);
	const [shown, setShown] = useState(state);

	Controls.direct.usePress(toggleDirect);

	useEffect(() => {
		if (state) setShown(state);
	}, [state]);

	// song select flips into queue mode in place rather than stacking a second
	// carousel over the one already on screen. Nothing is rendered, so nothing
	// will animate out either - drop it now, or closing the page leaves it held
	// and the next scene mounts a whole carousel for the fade.
	const inPlace = shown?.page === 'queue' && scene === SCENE.SELECT;
	useEffect(() => {
		if (inPlace && !state) setShown(undefined);
	}, [inPlace, state]);

	const covers = !!state && !(state.page === 'queue' && scene === SCENE.SELECT);
	useKeyboardOwner(undefined, {
		active: covers, layer: LAYER.PAGE, close: () => openPage.set(undefined),
	});

	if (!shown || inPlace) return null;
	const closing = !state;

	return (
		<div
			className={[
				'page-overlay',
				closing ? 'is-closing' : 'is-open',
				// over a running play, the page thins out so the playfield behind it
				// is still readable - you are managing a character that is playing
				scene === SCENE.GAME ? 'is-over-play' : '',
				// oss!direct comes in from the edge tab it was opened from
				shown.page === 'direct' ? 'from-right' : '',
			].join(' ')}
			onAnimationEnd={(e) => {
				if (e.target === e.currentTarget && !openPage.get()) setShown(undefined);
			}}
		>
			<KeyboardLayer.Provider value={{
				layer: LAYER.PAGE, open: !closing, 
			}}>
				{shown.page === 'character'
					? <Character tab={shown.tab} />
					: shown.page === 'direct'
						? <Direct />
						: shown.page === 'queue'
							? <Suspense fallback={null}><SongSelect mode="queue" /></Suspense>
							: shown.page === 'skins'
								? <Skins key={shown.view} view={shown.view} />
								: <Addons key={shown.view} view={shown.view} />}
			</KeyboardLayer.Provider>
		</div>
	);
}
