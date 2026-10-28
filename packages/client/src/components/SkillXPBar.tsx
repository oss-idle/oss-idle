import {
	useEffect,
	useState,
} from 'react';

import { bignum } from '@oss-idle/shared/display/num';
import SkillLevel from '@oss-idle/shared/display/SkillLevel';
import type { SkillGain } from '@oss-idle/shared/play';
import SkillState from '@oss-idle/shared/rulesets/skillState';

import { selectedDef } from '../rulesets/registry';

const SEGMENT_MS = 2000;     // time to pour a full level's worth of fill
const MIN_SEGMENT_MS = 1000; // floor so tiny gains still read as a fill
/** Ramps in, runs, settles out - applied across the whole gain rather than per
 *  level, so a long climb accelerates through the middle instead of ticking
 *  along at one level per beat. */
const easeInOutCubic = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

type Segment = { level: number, from: number, to: number };

/**
 * Break the gain into per-level fill segments. Every segment but the last ends
 * flush at a level boundary (fill 1), so the bar visibly tops out, pops the
 * level, and refills from empty for each level crossed - landing exactly on the
 * persisted (toLevel, toXp).
 */
function buildSegments({ 
	fromLevel,
	fromXp,
	toLevel, 
	toXp,
}: SkillGain): Segment[] {
	const startFill = fromXp / SkillState.xpForLevel(fromLevel);
	if (toLevel === fromLevel) {
		return [{ 
			level: fromLevel, 
			from: startFill, 
			to: toXp / SkillState.xpForLevel(toLevel), 
		}];
	}
	const segs: Segment[] = [{
		level: fromLevel, from: startFill, to: 1, 
	}];
	for (let l = fromLevel + 1; l < toLevel; l++) {
		segs.push({
			level: l, from: 0, to: 1, 
		});
	}
	segs.push({
		level: toLevel, from: 0, to: toXp / SkillState.xpForLevel(toLevel), 
	});
	return segs;
}

/** How long the whole gain takes: its natural pace over the distance covered,
 *  capped by the budget. The floor keeps a tiny gain readable; a big one has to
 *  give it up, or eighty levels would run for eighty seconds. Distance, not
 *  segment count - a level boundary landed on exactly costs no extra time. */
const runDuration = (spanned: number, budgetMs: number): number =>
	Math.min(Math.max(MIN_SEGMENT_MS, SEGMENT_MS * spanned), budgetMs);

export default function SkillXPBar({ 
	progress, 
	delay = 0, 
	budgetMs = SEGMENT_MS * 2,
	prestige,
	lifetimeXp,
}: { 
	progress: SkillGain, 
	delay?: number
	/** how long this bar's whole fill may take, however many levels it crosses */
	budgetMs?: number
	/** the skill's prestige and lifetime total, so the xp level hovers with the
	 *  level shown on the skill pages */
	prestige?: number
	lifetimeXp?: number
}) {
	const { skill, gained, fromLevel } = progress;
	const startFill = progress.fromXp / SkillState.xpForLevel(fromLevel);
	const [state, setState] = useState({
		level: fromLevel, fill: startFill, 
	});
	const [appeared, setAppeared] = useState(false);

	useEffect(() => {
		if (!appeared) return;
		const segs = buildSegments(progress);
		// distance is measured in bar-fills, so one clock eased over the whole
		// climb carries the level pops with it
		const spans = segs.map((s) => s.to - s.from);
		const total = spans.reduce((a, b) => a + b, 0) || 1;
		const duration = runDuration(total, budgetMs);
		let start = 0;
		let raf = 0;
		const tick = (now: number) => {
			if (!start) start = now;
			const t = Math.min(1, (now - start) / duration);
			let travelled = easeInOutCubic(t) * total;
			let i = 0;
			while (i < segs.length - 1 && travelled >= spans[i]) {
				travelled -= spans[i];
				i++;
			}
			const seg = segs[i];
			setState({ 
				level: seg.level, 
				fill: seg.from + travelled, 
			});
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [progress, appeared, budgetMs]);

	const gainedLevels = state.level - fromLevel;
	const leveled = gainedLevels > 0;

	return (
		<div
			className={`skillxp__row ${leveled ? 'is-leveled' : ''}`}
			style={{ animationDelay: `${delay}ms` }}
			onAnimationEnd={(e) => { 
				if (e.animationName === 'skillxp-enter') setAppeared(true); 
			}}
		>
			<span className="skillxp__name">{selectedDef().skillName(skill)}</span>
			{/* keyed so each level-up remounts and replays the pop animation */}
			<span className="skillxp__level" key={state.level}>
				<i>XP Lv</i><SkillLevel
					level={state.level}
					xp={state.fill * SkillState.xpForLevel(state.level)}
					prestige={prestige}
					lifetimeXp={lifetimeXp}
					xpLevel
				/>
				{gainedLevels > 0 && <em 
					className="skillxp__levelup" 
					key={gainedLevels}
				>
					▲{gainedLevels}
				</em>}
			</span>
			<div className="skillxp__track">
				<div className="skillxp__fill" style={{ width: `${state.fill * 100}%` }} />
			</div>
			<span className="skillxp__gain">
				{gained > 0 ? `+${bignum(gained)}xp` : '--'}
			</span>
		</div>
	);
}
