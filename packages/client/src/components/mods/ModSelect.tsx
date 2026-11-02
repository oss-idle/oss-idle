import './ModSelect.css';
import '../ContextMenu.css';

import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useEffect } from 'react';

import {
	MOD_LOOK,
	modName,
} from '@oss-idle/shared/display/mods';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import {
	countsForMedals,
	isRankedMods,
	type Mod,
	modsScoreMultiplier,
} from '@oss-idle/shared/mods';
import {
	MAX_RATE,
	MIN_RATE,
	RATE_STEP,
	rateSteps,
	scoreMultiplier,
} from '@oss-idle/shared/rate';

import { SETTINGS } from '../../db/settings';
import Entities from '../../entity/entities';
import {
	pickMod,
	resetMods,
	selectedMods,
} from '../../gameplay/playMods';
import {
	pickRate,
	selectedRate,
	speedUpgrades,
} from '../../gameplay/playRate';
import { inTextBox } from '../../input/Controls';
import useKeyboardOwner from '../../input/keyboardOwner';
import { selectedRuleset } from '../../rulesets/registry';
import ModTile from './ModTile';
import { rateShort } from './rateShort';
import RateStepper from './RateStepper';
import XpMultipliers from './XpMultipliers';

const sideSteps = (from: number, to: number): number[] => {
	const steps: number[] = [];
	const count = Math.round(Math.abs(to - from) / RATE_STEP);
	const direction = Math.sign(to - from);
	for (let i = 0; i <= count; i++) {
		steps.push(Math.round((from + direction * i * RATE_STEP) * 100) / 100);
	}
	return steps;
};
const SLOWER = sideSteps(1 - RATE_STEP, MIN_RATE);
const FASTER = sideSteps(1 + RATE_STEP, MAX_RATE);

/** SD, PF and JT share a tile: off → SD → PF → JT → off. */
const DEATH: Mod[] = ['SD', 'PF', 'JT'];
const cycleDeath = (mods: Mod[]) => {
	const next = DEATH[DEATH.findIndex(m => mods.includes(m)) + 1];
	pickMod(next ?? 'JT');
};

/** mod select over song select. */
export default function ModSelect({ onClose }: { onClose: () => void }) {
	useKeyboardOwner(undefined, { close: onClose });
	const { t } = useLingui();
	const [rate] = useSynced(selectedRate);
	const [mods] = useSynced(selectedMods);
	const [ruleset] = useSynced(selectedRuleset);
	const [character] = useSynced(Entities.character);
	const unlocked = rateSteps(speedUpgrades(character));
	const none = unlocked.length === 1;
	const pick = pickRate;
	const reset = () => {
		pick(1);
		resetMods();
	};
	const on = (mod: Mod) => mods.includes(mod);
	const tile = (mod: Mod, onClick = () => pickMod(mod)) => (
		<div className="mod-select__mod">
			<ModTile
				glyph={MOD_LOOK[mod].glyph} label={modName(mod)} tint={MOD_LOOK[mod].tint}
				on={on(mod)} disabled={false} onClick={onClick}
			/>
		</div>
	);
	// on: the last rate picked on that side; off: back to x1
	const toggle = (side: number[]) => pick(side.includes(rate)
		? 1
		: (side === FASTER ? SETTINGS.fasterRate : SETTINGS.slowerRate).get());
	// the wheel over a lit mod steps along its side, never across x1
	const wheel = (side: number[]) => (e: React.WheelEvent) => {
		const next = Math.round((rate + (e.deltaY < 0 ? 1 : -1) * RATE_STEP) * 100) / 100;
		if (side.includes(rate) && side.includes(next)) pick(next);
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (inTextBox(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
			// F1 is the footer's toggle
			if (e.key === '1') reset();
			else if (e.key === '2') onClose();
			else return;
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const locked = none ? t`Upgrade Speed to unlock rates` : undefined;
	return (
		<div className="mod-select" onClick={onClose}>
			<div className="mod-select__panel" onClick={e => e.stopPropagation()}>
				<p className="mod-select__intro">
					<Trans>
						Mods change how a map plays. A faster rate usually makes the map harder,
						and a slower one easier.
					</Trans>
				</p>
				<div className="mod-select__multiplier">
					<Trans>Score Multiplier: {ph({ multiplier: (scoreMultiplier(rate) * modsScoreMultiplier(mods)).toFixed(2) })}x</Trans>
					<XpMultipliers mods={mods} />
					{!isRankedMods(mods) && (
						<div className="mod-select__unranked">
							<Trans>Unranked: no XP, and the score is not submitted</Trans>
						</div>
					)}
					{isRankedMods(mods) && !countsForMedals(mods) && (
						<div className="mod-select__unranked">
							<Trans>Most medals can't be earned with these mods</Trans>
						</div>
					)}
				</div>

				<div className="mod-select__row">
					<div className="mod-select__heading is-reduction"><Trans>Difficulty Reduction</Trans></div>
					<div className="mod-select__mods">
						{tile('EZ')}
						{tile('NF')}
						<div className="mod-select__mod" onWheel={wheel(SLOWER)}>
							<ModTile
								glyph="hourglass" label={t`Half`} tint="#5b5b66"
								short={rateShort(rate < 1 ? rate : SETTINGS.slowerRate.get())}
								on={rate < 1} disabled={none} title={locked} onClick={() => toggle(SLOWER)}
							/>
							{rate < 1 && <RateStepper steps={SLOWER} unlocked={unlocked} current={rate} onPick={pick} />}
						</div>
					</div>
				</div>

				<div className="mod-select__row">
					<div className="mod-select__heading is-increase"><Trans>Difficulty Increase</Trans></div>
					<div className="mod-select__mods">
						{tile('HR')}
						{tile(DEATH.find(on) ?? 'SD', () => cycleDeath(mods))}
						<div className="mod-select__mod" onWheel={wheel(FASTER)}>
							<ModTile
								glyph="clock" label={t`Double`} tint="#8c4fd0"
								short={rateShort(rate > 1 ? rate : SETTINGS.fasterRate.get())}
								on={rate > 1} disabled={none} title={locked} onClick={() => toggle(FASTER)}
							/>
							{rate > 1 && <RateStepper steps={FASTER} unlocked={unlocked} current={rate} onPick={pick} />}
						</div>
					</div>
				</div>

				{ruleset === 'mania7k' && (
					<div className="mod-select__row">
						<div className="mod-select__heading"><Trans>Layout</Trans></div>
						<div className="mod-select__mods">
							{tile('RT')}
						</div>
					</div>
				)}

				<div className="ctxmenu__options">
					<button
						type="button" className="ctxmenu__option" style={{ '--accent': '#e93100' } as React.CSSProperties}
						onClick={reset}
					>
						<Trans>1. Reset All Mods</Trans>
					</button>
					<button
						type="button" className="ctxmenu__option" style={{ '--accent': '#6b6b6b' } as React.CSSProperties}
						onClick={onClose}
					>
						<Trans>2. Close</Trans>
					</button>
				</div>
			</div>
		</div>
	);
}
