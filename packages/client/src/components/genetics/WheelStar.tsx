import { uiSound } from '../../audio/uiSounds';
import { selectedDef } from '../../rulesets/registry';
import type { Point } from './geneLayout';
import SkillStar from './SkillStar';

type Props = { at: Point, skill: string, power: number, top: boolean, open: () => void };

/** A tree's own star: on the top tree it opens the skill's card. */
export default function WheelStar({
	at, skill, power, top, open,
}: Props) {
	if (!top) return <SkillStar at={at} r={30} name="" strength={power} />;
	return (
		<g
			className="genetics__star"
			onMouseEnter={() => uiSound('ui/default-hover')}
			onClick={e => {
				e.stopPropagation();
				uiSound('ui/default-select');
				open();
			}}
		>
			<SkillStar at={at} r={30} name={selectedDef().skillName(skill)} strength={power} />
		</g>
	);
}
