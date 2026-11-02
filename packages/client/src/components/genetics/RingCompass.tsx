import {
	type GeneticsDef,
	strength,
} from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import { selectedDef } from '../../rulesets/registry';

type Props = {
	def: GeneticsDef,
	picked: readonly string[],
	/** the skill in the middle of the sky */
	shown: string,
	onPick: (skill: string) => void,
};

const SIZE = 240, C = SIZE / 2, R = 62;

/** The ring of skills, small, top left: it grows under the cursor and names every skill. */
export default function RingCompass({
	def, picked, shown, onPick,
}: Props) {
	const n = def.ring.length, start = def.ring.indexOf(picked[0]);
	return (
		<div className="ring-compass" onClick={e => e.stopPropagation()}>
			<svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
				<circle className="ring-compass__plate" cx={C} cy={C} r={R + 22} />
				{def.ring.map((skill, i) => {
					const a = ((i - start) * 360 / n - 90) * Math.PI / 180;
					const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
					const lx = C + (R + 34) * Math.cos(a), ly = C + (R + 34) * Math.sin(a);
					const s = strength(def, picked, skill), mine = picked.includes(skill);
					const kind = mine ? 'is-genetic' : s ? 'is-near' : '';
					return (
						<g
							key={skill}
							className={`ring-compass__skill ${kind}${skill === shown ? ' is-shown' : ''}`}
							onMouseEnter={() => uiSound('ui/default-hover')}
							onClick={() => onPick(skill)}
						>
							<circle className="ring-compass__hit" cx={x} cy={y} r={14} />
							<circle className="ring-compass__dot" cx={x} cy={y} r={mine ? 9 : 7} />
							{skill === shown && <circle className="ring-compass__here" cx={x} cy={y} r={13} />}
							<text
								className="ring-compass__name"
								x={lx}
								y={ly + 4}
								textAnchor={Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'}
							>
								{selectedDef().skillName(skill)}{s && s !== 0.5 && s !== 1 ? ` ${s * 100}%` : ''}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}
