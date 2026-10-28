import { useState } from 'react';

import { DEBUG_MAX_LEVEL } from '@oss-idle/shared/debug';
import {
	fatigueLevel,
	STRAIN_CAP,
	warmup,
	warmupBar,
} from '@oss-idle/shared/fatigue';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import type SkillState from '@oss-idle/shared/rulesets/skillState';

import type Character from '../db/schema/character';
import {
	debugFatigueMinutes,
	setDebugCharacter,
} from '../online/services/debugCharacter';
import {
	type DebugBot,
	fromCharacter,
	prestigeOf,
	staminaGear,
	withLevels,
} from '../rulesets/mania/4k/debugBot';
import DebugKnob from './DebugKnob';
import { warmupStage } from './warmupStage';

type Props = {
	character: Character;
	bot: DebugBot;
	onChange: (bot: DebugBot) => void;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Debug-only: the knobs every skill shares - all levels at once, memory's
 *  tries, the warm-up - and the way back to and onto the character. */
export default function StrainDebugControls({ character, bot, onChange }: Props) {
	const [all, setAll] = useState(bot.levels.accuracy);
	const [status, setStatus] = useState('');
	const gear = staminaGear(character);
	const minutes = bot.fatigueMinutes;
	const bar = warmupBar(minutes, gear);

	const setEvery = (level: number) => {
		setAll(level);
		onChange(withLevels(bot, Object.fromEntries(Object.keys(bot.levels).map(s => [s, level]))));
	};

	const reset = async () => {
		const fatigue = await debugFatigueMinutes();
		onChange({
			...fromCharacter(character), ...fatigue === undefined ? {} : { fatigueMinutes: fatigue },
		});
		setStatus('The character\'s own values');
	};

	const apply = async () => {
		// the debug bot is 4K's
		const skills = character.skills as readonly SkillState<SkillName>[];
		const levels = Object.fromEntries(skills
			.filter(s => bot.levels[s.name] !== s.level.get())
			.map(s => [s.name, bot.levels[s.name]]));
		const prestige = Object.fromEntries(skills
			.filter(s => prestigeOf(character, bot, s.name) !== s.prestige.get())
			.map(s => [s.name, prestigeOf(character, bot, s.name)]));
		setStatus('Applying…');
		const ok = await setDebugCharacter({
			levels, prestige, ...character.isGuest() ? {} : { fatigueMinutes: minutes },
		});
		setStatus(ok ? 'Applied: real plays use these now' : 'Failed');
	};

	return (
		<div className="strain__controls">
			<div className="strain__readout strain__legend">
				Levels are as the game shows them; setting one drops its skill's prestige.
			</div>
			<DebugKnob
				label="All skills"
				value={all}
				min={0}
				max={DEBUG_MAX_LEVEL}
				onChange={setEvery}
			/>
			<DebugKnob
				label="Memory tries"
				value={bot.timesPlayed}
				min={0}
				max={60}
				onChange={timesPlayed => onChange({
					...bot, timesPlayed, 
				})}
			/>
			<DebugKnob
				label="Warm-up (min)"
				value={Math.round(minutes)}
				min={0}
				max={STRAIN_CAP}
				onChange={fatigueMinutes => onChange({
					...bot, fatigueMinutes, 
				})}
			/>
			<div className="strain__readout">
				{`warm-up ${pct(warmup(minutes, gear))} · bar ${pct(bar)} ${warmupStage(bar)}`
					+ ` · fatigue ${pct(fatigueLevel(minutes))}`}
			</div>
			<div className="strain__control-actions">
				<span className="strain__readout">{status}</span>
				<button className="strain__btn strain__btn--close" onClick={() => void reset()}>
					From character
				</button>
				<button className="strain__btn" onClick={() => void apply()}>
					Apply to character
				</button>
			</div>
		</div>
	);
}
