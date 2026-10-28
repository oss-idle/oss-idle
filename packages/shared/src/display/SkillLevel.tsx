import {
	effectiveLevelOf,
	playLevelOf,
} from '../xp.js';
import HoverCard from './HoverCard.js';
import HoverCardRow from './HoverCardRow.js';
import {
	levelFromTotalXp,
	levelFromXp,
	levelNode,
} from './levelDisplay.js';

/**
 * The level a skill is shown at: what its lifetime xp is worth plus prestige bonus levels,
 * the level it plays at. Hovering breaks it back into the parts it was built from.
 *
 * The level -> skill mapping is deliberately absent: it belongs to the strain
 * curves, and the player is shown real levels.
 */
export default function SkillLevel({
	level,
	xp,
	prestige = 0,
	lifetimeXp,
	xpLevel,
}: {
	level: number,
	xp: number,
	prestige?: number,
	/** xp ever earned on the skill, shown as the level it would be worth */
	lifetimeXp?: number,
	/** show the xp level, the one upgrade and prestige costs count */
	xpLevel?: boolean,
}) {
	const total = playLevelOf(level, xp, lifetimeXp ?? 0, prestige);
	const shown = xpLevel ? effectiveLevelOf(level, xp) : total;

	return <HoverCard card={<>
		{!!lifetimeXp && <HoverCardRow label="Lifetime">{levelFromTotalXp(lifetimeXp)}</HoverCardRow>}
		{prestige > 0 && <HoverCardRow label="Prestige">+{prestige}</HoverCardRow>}
		<HoverCardRow label="XP level">{levelFromXp(level, xp)}</HoverCardRow>
		{xpLevel && shown !== total && <HoverCardRow label="Level">
			{levelNode(total, total - Math.floor(total))}
		</HoverCardRow>}
	</>}>
		{levelNode(shown, shown - Math.floor(shown))}
	</HoverCard>;
}
