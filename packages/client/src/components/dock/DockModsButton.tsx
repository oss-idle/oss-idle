import { Trans } from '@lingui/react/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { playLabel } from '@oss-idle/shared/mods';

import { selectedMods } from '../../gameplay/playMods';
import { selectedRate } from '../../gameplay/playRate';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import { modSelectOpen } from '../mods/modSelectOpen';

/** Song select's Mods, where the screen is too narrow for the footer it lives in. */
export default function DockModsButton() {
	const [scene] = useSynced(SceneManager.current);
	const [rate] = useSynced(selectedRate);
	const [mods] = useSynced(selectedMods);
	const active = playLabel(mods, rate);

	if (scene !== SCENE.SELECT) return null;

	return (
		<button
			type="button"
			className="dock__btn dock__btn--narrow"
			onClick={() => void modSelectOpen.set(!modSelectOpen.get())}
		>
			<Trans>mods</Trans>{active && ` ${active}`}
		</button>
	);
}
