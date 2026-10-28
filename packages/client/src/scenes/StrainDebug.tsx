import './StrainDebug.css';

import {
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

import { DEBUG_MAX_LEVEL } from '@oss-idle/shared/debug';
import accuracy from '@oss-idle/shared/display/accuracy';
import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import type { SkillName } from '@oss-idle/shared/rulesets/mania/4k/skills';
import type { DebugAnalysis } from '@oss-idle/shared/rulesets/mania/analysis';
import { Judgements } from '@oss-idle/shared/rulesets/mania/judgement';
import type { HitRecord } from '@oss-idle/shared/rulesets/mania/maniaGame';

import Entities from '../entity/entities';
import DebugKnob from '../gameplay/DebugKnob';
import { unstableRate } from '../gameplay/hitError';
import { selectedMods } from '../gameplay/playMods';
import { selectedRate } from '../gameplay/playRate';
import StrainDebugControls from '../gameplay/StrainDebugControls';
import StrainGraph from '../gameplay/StrainGraph';
import useKeyboardOwner from '../input/keyboardOwner';
import { debugStrains } from '../online/services/debugCharacter';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import { currentSkin } from '../osu/skin/Skin';
import {
	type DebugBot,
	debugBot,
	debugBotOf,
	prestigeOf,
	withLevels,
} from '../rulesets/mania/4k/debugBot';

/** A real level as the game shows it, prestige added. */
const levelHint = (level: number, prestige: number) =>
	(prestige ? `shown Lv ${level + prestige} (+${prestige} prestige)` : undefined);

/** How long the knobs rest before the map is simulated again. */
const SETTLE_MS = 250;

/** The server's analysis as the graphs draw it. */
const viewOf = (analysis: DebugAnalysis) => ({
	...analysis,
	series: analysis.series.map(s => ({
		...s,
		hits: s.hits.map(([time, offset, judgement, hp]): HitRecord => ({
			time, offset, judgement, ...hp !== undefined && { hp },
		})),
		overlay: s.overlay?.map(([time, value]) => ({
			time, value,
		})),
	})),
});

interface Props {
	beatmapInfo: LightBeatmap
	onClose: () => void
	/** launch a no-fail local play driven by the debug bot */
	onPlay: () => void
}

/**
 * Debug overlay: the server runs every skill of the debug bot over the selected
 * beatmap and returns the deviance graph each one would produce (plus the
 * combined result the bot actually plays), without playing the map. The knobs
 * set the bot - levels, memory's tries, warm-up - and the map is simulated again
 * as they move, with song select's rate and mods. Re-roll re-samples the
 * randomness.
 */
export default function StrainDebug({ beatmapInfo, onClose, onPlay }: Props) {
	const [skin] = useSynced(currentSkin);
	const [character] = useSynced(Entities.character);
	const [stored] = useSynced(debugBot);
	const [rate] = useSynced(selectedRate);
	const [mods] = useSynced(selectedMods);
	const [roll, setRoll] = useState(0);
	const beatmap = useAsync(async () => await beatmapInfo.load(), [beatmapInfo]);
	// the knobs move at once; the bot follows once they settle
	const [draft, setDraft] = useState<DebugBot>();
	const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(settle.current), []);
	const bot = useMemo(
		() => (character ? stored ?? debugBotOf(character) : undefined),
		[character, stored],
	);
	const knobs = draft ?? bot;

	const change = (next: DebugBot) => {
		setDraft(next);
		clearTimeout(settle.current);
		settle.current = setTimeout(() => void debugBot.set(next), SETTLE_MS);
	};

	const setLevel = (skill: SkillName, level: number) =>
		knobs && change(withLevels(knobs, { [skill]: level }));

	// `roll` is included so "re-roll" re-samples the analysis
	const analysis = useAsync(
		async () => {
			if (!beatmap || !bot) return undefined;
			const result = await debugStrains({
				beatmapId: beatmap.metadata.beatmapId, rate, mods, ...bot,
			});
			return result && viewOf(result);
		},
		[beatmap, bot, rate, mods, roll],
	);
	useKeyboardOwner(undefined, { close: onClose });

	if (!beatmap || !character || !knobs) return;

	const title = `${beatmap.metadata.artist} - ${beatmap.metadata.title}`;
	const subtitle = `[${beatmap.metadata.version}] ${beatmap.metadata.beatmapId}`;

	// over all of song select, its docks included: it is its own screen
	return createPortal(
		<div className="strain">
			<header className="strain__bar">
				<div className="strain__title">
					Strain debug - {title} <span>{subtitle}</span>
					{rate !== 1 && <span>{` · ${rate}x`}</span>}
				</div>
				<div className="strain__actions">
					<button className="strain__btn" onClick={onPlay}>
						▶ play as bot
					</button>
					<button className="strain__btn" onClick={() => setRoll((r) => r + 1)}>
						↻ re-roll
					</button>
					<button className="strain__btn strain__btn--close" onClick={onClose}>
						✕ close
					</button>
				</div>
			</header>

			<StrainDebugControls character={character} bot={knobs} onChange={change} />

			<div className="strain__grid">
				{analysis?.series.map((s) => (
					<div
						className={`strain__cell ${s.name === 'combined' ? 'is-combined' : ''}`}
						key={s.name}
					>
						<div className="strain__name">
							<span>
								{s.name}
								{s.level !== undefined && s.level !== knobs.levels[s.name as SkillName] && (
									<i className="strain__level">plays at Lv {s.level}</i>
								)}
							</span>
							<span className="strain__ur">{unstableRate(s.hits).toFixed(0)} UR</span>
						</div>
						{s.name !== 'combined' && (
							<DebugKnob
								label="Level"
								value={knobs.levels[s.name as SkillName]}
								min={0}
								max={DEBUG_MAX_LEVEL}
								onChange={level => setLevel(s.name as SkillName, level)}
								hint={levelHint(
									knobs.levels[s.name as SkillName],
									prestigeOf(character, knobs, s.name as SkillName),
								)}
							/>
						)}
						<div className="strain__stats">
							<span className="strain__score">
								{Math.round(s.score.score).toLocaleString()}
							</span>
							<span className="strain__acc">{accuracy(s.score.accuracy)}</span>
							{s.xp !== undefined && <span className="strain__xp">
								+{s.xp.toLocaleString()} XP
							</span>}
							<span className="strain__judges">
								{Judgements.map((j) => (
									<i key={j} style={{ color: skin.data.judgements[j].judge }}>
										{s.score.counts[j]}
									</i>
								))}
							</span>
						</div>
						<StrainGraph 
							hits={s.hits} 
							windows={analysis.windows} 
							songEndMs={analysis.songEndMs}
							failMs={s.failMs}
							overlay={s.overlay}
						/>
					</div>
				))}
			</div>
		</div>
		, document.body);
}
