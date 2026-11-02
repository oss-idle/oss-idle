import { useState } from 'react';

import type { GeneticsDef } from '@oss-idle/shared/genetics';
import sleep from '@oss-idle/shared/helpers/sleep';

import { uiSound } from '../../audio/uiSounds';
import {
	geneticChoice,
	geneticChoiceSlot,
	openPage,
} from '../../globals';
import { pickGenetic } from '../../online/services/genetics';
import type { QuizQuestion } from '../../rulesets/ruleset';
import SceneManager, { SCENE } from '../../scenes/SceneManager';
import { quizOutcome } from './quizOutcome';
import useChoiceKeys from './useChoiceKeys';
import type useChoiceSlot from './useChoiceSlot';

export type Screen = 'ring' | 'quiz' | 'trees';

const close = () => {
	void geneticChoiceSlot.set(undefined);
	void geneticChoice.set(undefined);
};

/** the ring's way out, over the genetics page (genetic-choice-out) */
const LEAVE_MS = 500;

/** Where character creation is: the ring, the quiz and its answers, and picking for real. */
export default function useGeneticChoiceFlow(
	def: GeneticsDef | undefined,
	quiz: readonly QuizQuestion[],
	first: boolean,
	active: boolean,
	{
		slot, more, others, needsSlot,
	}: Pick<ReturnType<typeof useChoiceSlot>, 'slot' | 'more' | 'others' | 'needsSlot'>,
) {
	const [screen, setScreen] = useState<Screen>('ring');
	const [picked, setPicked] = useState<string>();
	const [answers, setAnswers] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [leaving, setLeaving] = useState(false);

	const flow = {
		screen,
		picked,
		answers,
		busy,
		leaving,
		pick: setPicked,
		show: setScreen,
		quiz: () => {
			setAnswers([]);
			setScreen('quiz');
		},
		back: () => {
			if (screen === 'quiz' && answers.length) setAnswers(answers.slice(0, -1));
			else if (screen !== 'ring') setScreen('ring');
			else close();
		},
		turn: (by: number) => {
			const ring = (def?.ring ?? []).filter(skill => !others.includes(skill));
			const i = picked ? ring.indexOf(picked) : -1;
			uiSound('ui/default-select');
			setPicked(ring[(i + by + ring.length) % ring.length]);
		},
		answer: (skill: string) => {
			const next = [...answers, skill];
			setAnswers(next);
			const outcome = def && quizOutcome(def, quiz, next);
			if (!outcome) return;
			uiSound('ui/dialog-ok-select');
			setPicked(others.includes(outcome.skill) ? undefined : outcome.skill);
			setScreen('ring');
		},
		answerAt: (i: number) => quiz[answers.length]?.answers[i]?.skill,
		/** the pick shows at once; a signed-in character's is confirmed by the server meanwhile */
		begin: async (skill: string) => {
			if (busy) return;
			setBusy(true);
			uiSound('ui/dialog-ok-select');
			const done = pickGenetic(skill, slot);
			if (more) {
				setPicked(undefined);
				setAnswers([]);
				await done;
				setBusy(false);
				return;
			}
			setLeaving(true);
			if (first && SceneManager.current.get() === SCENE.MENU) SceneManager.set(SCENE.SELECT);
			void openPage.set({
				page: 'character', tab: 'genetics', 
			});
			await sleep(LEAVE_MS);
			close();
			setLeaving(false);
			setScreen('ring');
			setAnswers([]);
			await done;
			setBusy(false);
		},
	};
	useChoiceKeys({
		active,
		turn: screen === 'ring' && !needsSlot ? flow.turn : undefined,
		confirm: screen === 'ring' && picked ? () => void flow.begin(picked) : undefined,
		answer: screen === 'quiz' ? i => {
			const skill = flow.answerAt(i);
			if (skill) flow.answer(skill);
		} : undefined,
	});
	return flow;
}
