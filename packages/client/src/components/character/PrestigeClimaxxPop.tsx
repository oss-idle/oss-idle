import './prestigeClimaxx.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
} from 'react';

import { overdriveText } from '@oss-idle/shared/display/overdrive';
import { CLIMAXX_SYMBOL } from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import useKeyboardOwner from '../../input/keyboardOwner';
import { selectedDef } from '../../rulesets/registry';
import useTransfer from './useTransfer';

export type ClimaxxTransfer = {
	skill: string,
	/** what the prestige turned into climaxx */
	overdrive: number,
	/** the skill's climaxx before it, and what it earned */
	before: number,
	gain: number,
};

const DELAY_MS = 400, LENGTH_MS = 2800;
const MOTES = Array.from({ length: 60 }, (_, i) => i);
const SEGMENTS = Array.from({ length: 24 }, (_, i) => i);

const segmentClass = (i: number, lit: number, done: boolean) => {
	if (i < lit - 1 || (done && i < lit)) return 'is-lit';
	return i === lit - 1 ? 'is-now' : undefined;
};

/** A prestige's overdrive draining into the skill's climaxx, shown as it happens. */
export default function PrestigeClimaxxPop({
	skill, overdrive, before, gain, onClose,
}: ClimaxxTransfer & { onClose: () => void }) {
	const progress = useTransfer(DELAY_MS, LENGTH_MS);
	const done = progress >= 1;
	const ok = useRef<HTMLButtonElement>(null);
	useKeyboardOwner(ok, { close: onClose });
	useEffect(() => {
		if (done) uiSound('ui/dialog-ok-select');
	}, [done]);

	const name = selectedDef().skillName(skill);
	const earned = gain.toLocaleString();
	const climaxx = Math.round(before + gain * progress).toLocaleString();
	return (
		<div className="climaxx-pop" onClick={e => e.stopPropagation()}>
			<div className="climaxx-pop__card">
				<div className="climaxx-pop__kicker"><Trans>{name} · Prestige</Trans></div>
				<h3 className="climaxx-pop__title"><Trans>Overdrive becomes climaxx</Trans></h3>
				<div className="climaxx-pop__swap">
					<div className={done ? 'is-empty' : undefined}>
						<small><Trans>Overdrive</Trans></small>
						<b>{overdriveText(overdrive * (1 - progress))}</b>
					</div>
					<div className={`climaxx-pop__to${done ? '' : ' is-rising'}`}>
						<small><Trans>{name} climaxx</Trans></small>
						<b>{CLIMAXX_SYMBOL}{climaxx}</b>
					</div>
					<div className="climaxx-pop__motes">
						{MOTES.map(i => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
					</div>
				</div>
				<div className="climaxx-pop__segments">
					{SEGMENTS.map(i => (
						<i
							key={i}
							className={segmentClass(i, Math.round(progress * SEGMENTS.length), done)}
						/>
					))}
				</div>
				<div className={`climaxx-pop__end${done ? ' is-done' : ''}`}>
					<span>+{CLIMAXX_SYMBOL}{earned}</span>
					<button ref={ok} className="ladder-act__buy climaxx-pop__ok" onClick={onClose}>
						<span><Trans>OK</Trans></span>
					</button>
				</div>
			</div>
		</div>
	);
}
