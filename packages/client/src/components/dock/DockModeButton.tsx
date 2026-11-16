import { Trans } from '@lingui/react/macro';
import {
	type MouseEvent,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { rulesetLabel } from '@oss-idle/shared/rulesets/display';

import { ENABLED_RULESETS } from '../../rulesets/enabled';
import { selectedRuleset } from '../../rulesets/registry';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import ModeSelect from '../songselect/ModeSelect';

/** Song select's Mode, where the screen is too narrow for the footer it lives in.
 *  Its menu opens above the dock. */
export default function DockModeButton() {
	const [scene] = useSynced(SceneManager.current);
	const [ruleset] = useSynced(selectedRuleset);
	const [anchor, setAnchor] = useState<DOMRect>();
	const toggle = (e: MouseEvent<HTMLButtonElement>) =>
		setAnchor(anchor ? undefined : e.currentTarget.closest('.dock')?.getBoundingClientRect());

	if (scene !== SCENE.SELECT || ENABLED_RULESETS.length < 2) return null;

	return (<>
		<button
			type="button"
			className="dock__btn dock__btn--narrow"
			onClick={toggle}
		>
			<Trans>mode</Trans> {rulesetLabel(ruleset)}
		</button>
		{anchor && createPortal(
			<ModeSelect anchor={anchor} onClose={() => setAnchor(undefined)} />,
			document.body,
		)}
	</>);
}
