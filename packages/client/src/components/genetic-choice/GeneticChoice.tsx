import './geneticChoice.css';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import Entities from '../../entity/entities';
import { geneticChoice } from '../../globals';
import useKeyboardOwner, { LAYER } from '../../input/keyboardOwner';
import {
	selectedDefLoaded,
	selectedGenetics,
} from '../../rulesets/registry';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import GeneticsPreview from '../genetics/GeneticsPreview';
import OsuBackButton from '../OsuBackButton';
import GeneticChoiceTitle from './GeneticChoiceTitle';
import GeneticChoiceUnder from './GeneticChoiceUnder';
import GeneticPickScreen from './GeneticPickScreen';
import GeneticQuizScreen from './GeneticQuizScreen';
import { quizOutcome } from './quizOutcome';
import useAskOnSongSelect from './useAskOnSongSelect';
import useChoiceSlot from './useChoiceSlot';
import useGeneticChoiceFlow from './useGeneticChoiceFlow';

/** What a character was born good at: picked on the ring, or found with a short quiz. */
export default function GeneticChoice() {
	const [mode] = useSynced(geneticChoice);
	const [character] = useSynced(Entities.character);
	// always mounted: on a fresh start it renders before the ruleset has loaded
	const def = selectedDefLoaded()?.genetics;
	const quiz = selectedGenetics()?.quiz ?? [];
	const shown = !!mode && !!def && character.id !== 0;
	const choice = useChoiceSlot(character);
	const flow = useGeneticChoiceFlow(def, quiz, mode === 'first', shown, choice);
	const [scene] = useSynced(SceneManager.current);
	useAskOnSongSelect(scene === SCENE.SELECT, character, def);

	useKeyboardOwner(undefined, {
		active: shown, layer: LAYER.GENETIC_CHOICE, close: flow.back,
	});
	if (!shown) return null;

	const result = quizOutcome(def, quiz, flow.answers);
	return (
		<div className={`genetic-choice${flow.leaving ? ' is-leaving' : ''}`}>
			{flow.screen === 'ring' ? (
				<GeneticPickScreen
					def={def}
					title={(
						<GeneticChoiceTitle
							result={result}
							changing={choice.changing || choice.needsSlot}
							another={choice.another}
						/>
					)}
					picked={flow.picked}
					choice={choice}
					suggested={result ? [result.skill, ...result.close ? [result.close] : []] : undefined}
					why={result?.why}
					under={<GeneticChoiceUnder changing={choice.changing} several={choice.several} />}
					busy={flow.busy}
					onPick={skill => choice.click(skill, flow.pick)}
					onQuiz={flow.quiz}
					onTrees={() => flow.show('trees')}
					onBegin={skill => void flow.begin(skill)}
				/>
			) : flow.screen === 'trees' ? (
				<GeneticsPreview
					def={def}
					picked={flow.picked}
					others={choice.others}
					local={character.isGuest()}
				/>
			) : (
				<GeneticQuizScreen
					quiz={quiz}
					step={flow.answers.length}
					onAnswer={flow.answer}
					onSkip={() => flow.show('ring')}
				/>
			)}
			<OsuBackButton onBack={flow.back} />
		</div>
	);
}
