import './BeatmapXPBreakdown.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
} from 'react';
import { createPortal } from 'react-dom';

import BigNum from '@oss-idle/shared/display/BigNum';

import { selectedDef } from '../rulesets/registry';
import type { BeatmapXPInsight } from '../xpInsights';

/** The per-skill XP breakdown panel, anchored to the card's XP badge. Rendered
 *  in a body portal so the card's overflow/transform can't clip it. Closes on
 *  any press outside it (presses on the badge itself are left to the badge's
 *  own toggle). */
export default function BeatmapXPBreakdown({ insight, anchor, onClose }: {
	insight: BeatmapXPInsight,
	anchor: DOMRect,
	onClose: () => void,
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onPress = (e: PointerEvent) => {
			const inAnchor = e.clientX >= anchor.left && e.clientX <= anchor.right
				&& e.clientY >= anchor.top && e.clientY <= anchor.bottom;
			if (inAnchor || ref.current?.contains(e.target as Node)) return;
			onClose();
		};
		document.addEventListener('pointerdown', onPress);
		return () => document.removeEventListener('pointerdown', onPress);
	}, [anchor, onClose]);

	const rows = Object.entries(insight.bySkill)
		.sort(([, a], [, b]) => b - a);

	// flip above the badge when there's no room below
	const above = anchor.bottom > window.innerHeight - 320;
	const style = above
		? {
			left: anchor.right, top: anchor.top - 6,
			transform: 'translate(-100%, -100%)',
		}
		: {
			left: anchor.right, top: anchor.bottom + 6,
			transform: 'translateX(-100%)',
		};

	return createPortal(
		<div ref={ref} className="xp-breakdown" style={style}>
			<div className="xp-breakdown__title"><Trans>XP gained</Trans></div>
			{rows.map(([skill, gained]) => (
				<div key={skill} className="xp-breakdown__row">
					<span>{selectedDef().skillName(skill)}</span>
					<em>+<BigNum value={gained} theme="heat" />xp</em>
				</div>
			))}
		</div>,
		document.body,
	);
}
