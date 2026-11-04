import './ModeSelect.css';

import {
	ph,
	t,
} from '@lingui/core/macro';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	MODE_GLYPH,
	MODE_NAMES,
	rulesetLabel,
	type RulesetMode,
	variantName,
} from '@oss-idle/shared/rulesets/display';
import {
	type OsuMode,
	type RulesetId,
	RULESETS,
} from '@oss-idle/shared/rulesets/ids';

import {
	type UiSound,
	uiSound,
} from '../../audio/uiSounds';
import Entities from '../../entity/entities';
import { message } from '../../globals';
import useKeyboardOwner from '../../input/keyboardOwner';
import Account from '../../online/account';
import {
	guestLock,
	pickRuleset,
} from '../../online/services/ruleset';
import { ENABLED_RULESETS } from '../../rulesets/enabled';
import { selectedRuleset } from '../../rulesets/registry';
import Glyph from '../multiplayer/Glyph';
import ModeRow from './ModeRow';

/** The enabled rulesets grouped by mode, in the order they are enabled. */
const MODES = Map.groupBy(ENABLED_RULESETS, id => RULESETS[id].mode as RulesetMode);

/** osu!'s mode menu: the modes stacked above the Mode button, the first on top. A mode
 *  of several rulesets splits into its variants on hover. */
/** osu!'s ruleset sounds, by the osu! ruleset each one plays */
const RULESET_SOUND: Partial<Record<OsuMode, UiSound>> = {
	osu: 'ui/ruleset-select-osu',
	mania: 'ui/ruleset-select-mania',
};

export default function ModeSelect({ anchor, onClose }: {
	anchor: DOMRect,
	onClose: () => void,
}) {
	useKeyboardOwner(undefined, { close: onClose });
	const [current] = useSynced(selectedRuleset);
	const [character] = useSynced(Account.character);
	const [live] = useSynced(Entities.character);
	const lock = character?.rulesetLock ?? guestLock(live);
	const locked = (id: RulesetId) => lock !== undefined && lock !== id;

	const pick = (id: RulesetId) => {
		onClose();
		if (locked(id)) {
			const mode = rulesetLabel(id);
			void message.set(
				t`The previous generation needs to rebirth in ${ph({ mode })} to unlock this generation of ${ph({ mode })} player.`,
			);
			return;
		}
		if (id === current) return;
		const sound = RULESET_SOUND[RULESETS[id].mode];
		if (sound) uiSound(sound);
		void pickRuleset(id);
	};

	return (
		<div className="mode-select" onClick={onClose}>
			<div
				className="mode-select__panel"
				style={{
					left: anchor.left, bottom: window.innerHeight - anchor.top,
				}}
				onClick={e => e.stopPropagation()}
			>
				{[...MODES].map(([mode, ids]) => (
					<ModeRow
						key={mode}
						icon={<Glyph name={MODE_GLYPH[mode]} className="mode-select__icon" />}
						name={MODE_NAMES[mode]}
						variants={ids.map(id => ({
							id, label: variantName(id), locked: locked(id),
						}))}
						current={current}
						onPick={pick}
					/>
				))}
			</div>
		</div>
	);
}
