import './genetics.css';

import { useRef } from 'react';

import {
	climaxxOf,
	type Genetics,
	type GeneticsDef,
	geneticSlots,
	overdriveForNextTier,
	pickedSkills,
} from '@oss-idle/shared/genetics';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { useSyncedAll } from '@oss-idle/shared/hooks/useSyncedAll';

import { uiSound } from '../../audio/uiSounds';
import type Character from '../../db/schema/character';
import { playLevels } from '../../online/services/genetics';
import { selectedDef } from '../../rulesets/registry';
import PrestigeClimaxxPop from '../character/PrestigeClimaxxPop';
import ConfirmMenu from '../ConfirmMenu';
import ClimaxxBalance from './ClimaxxBalance';
import {
	branchLinks,
	type Point,
} from './geneLayout';
import { parallax } from './geneStyle';
import GeneticsBackdrop from './GeneticsBackdrop';
import GeneticsCards, { STAR } from './GeneticsCards';
import GeneticsFooter from './GeneticsFooter';
import GeneticsPickPrompt from './GeneticsPickPrompt';
import GeneticsSky from './GeneticsSky';
import RingCompass from './RingCompass';
import useGeneActions from './useGeneActions';
import useGeneticsKeys from './useGeneticsKeys';
import useSkyTurn from './useSkyTurn';

/** What the shown skill holds, and the overdrive its next tier needs. */
const balanceOf = (def: GeneticsDef, genetics: Genetics, character: Character, skill: string) => {
	const held = character.skills.find(s => s.name === skill);
	const level = held?.playLevel() ?? 0;
	return {
		climaxx: climaxxOf(def, genetics, skill, level),
		overdrive: held?.overdrive.get() ?? 0,
		need: overdriveForNextTier(def, genetics, skill, level),
		upgrades: held?.upgrades.get() ?? 0,
	};
};

/** The genetics tab: the genetic's genes and its neighbours', bought with each skill's climaxx. */
export default function GeneticsView({ character }: { character: Character }) {
	const def = selectedDef().genetics;
	const [genetics] = useSynced(character.genetics);
	useSyncedAll(
		() => character.skills.flatMap(s => [s.level, s.xp, s.overdrive, s.prestige]),
		[character],
	);
	const sky = useSkyTurn(def, genetics.picks[0]?.skill);
	const placed = useRef<Record<string, Point>>({});
	const levels = playLevels(character);
	const actions = useGeneActions(def, genetics, levels);
	const gene = sky.selected === STAR ? undefined : sky.selected;
	useGeneticsKeys({
		placed,
		links: branchLinks((def?.genes ?? []).filter(g => g.skill === sky.shown)),
		selected: gene,
		paused: !!actions.confirming || !!actions.transfer,
		select: next => {
			if (next && next !== sky.selected) uiSound('ui/default-hover');
			sky.select(next);
		},
		turn: sky.turnBy,
		learn: actions.learn,
		sell: actions.sell,
	});

	const shown = sky.shown;
	if (!def) return null;
	if (!shown || !genetics.picks.length) return <GeneticsPickPrompt />;

	const balance = balanceOf(def, genetics, character, shown);
	const { climaxx, overdrive, need } = balance;
	const convert = () => actions.convert(shown, balance);

	return (
		<div className="genetics" onClick={() => sky.select(undefined)} onPointerMove={parallax}>
			<GeneticsBackdrop />
			<div className="genetics__stage">
				<GeneticsSky
					def={def}
					genetics={genetics}
					at={sky.at}
					selected={gene}
					select={sky.select}
					turnBy={sky.turnBy}
					star={() => sky.select(STAR)}
					placed={p => (placed.current = p)}
				/>
				<GeneticsCards
					def={def}
					genetics={genetics}
					skill={shown}
					selected={sky.selected}
					at={gene ? placed.current[gene] : undefined}
					actions={{
						levels,
						climaxx,
						overdrive,
						need,
						local: character.isGuest(),
						busy: actions.busy,
						onLearn: actions.learn,
						onSell: actions.sell,
						onConvert: convert,
					}}
				/>
			</div>
			<RingCompass def={def} picked={pickedSkills(genetics)} shown={shown} onPick={sky.turnTo} />
			<ClimaxxBalance
				skill={selectedDef().skillName(shown)}
				climaxx={climaxx}
				overdrive={overdrive}
				need={need}
				converted={genetics.converted[shown] ?? 0}
				busy={actions.busy}
				onConvert={convert}
			/>
			<GeneticsFooter
				genetics={genetics}
				slots={geneticSlots(character.generation)}
				local={character.isGuest()}
			/>
			{actions.confirming && <ConfirmMenu {...actions.confirming} onClose={actions.close} />}
			{actions.transfer && <PrestigeClimaxxPop {...actions.transfer} onClose={actions.closeTransfer} />}
		</div>
	);
}
