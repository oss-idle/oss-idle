import {
	geneDoes,
	geneName,
} from '../components/genetics/geneText';
import Entities from '../entity/entities';
import { playLevels } from '../online/services/genetics';
import {
	loadRuleset,
	selectedDefLoaded,
	selectedRuleset,
} from '../rulesets/registry';
import {
	geneticsState,
	learnableGenes,
} from './genes';
import { setState } from './state';

let following = false;

/** Keeps `host.state`'s genes and genetics on the character's genetics, levels and ruleset. */
export const followGenes = (): void => {
	if (following) return;
	following = true;

	const show = (): void => {
		const character = Entities.character.get();
		const def = selectedDefLoaded()?.genetics;
		const text = {
			name: geneName, does: geneDoes,
		};
		setState('genes', def && learnableGenes(
			def, character.genetics.get(), playLevels(character), text, character.isGuest(),
		));
		setState('genetics', def && geneticsState(
			def, character.genetics.get(), playLevels(character), text,
		));
	};

	let stops: (() => void)[] = [];
	Entities.character.forceSync((character) => {
		stops.forEach(stop => stop());
		stops = [
			character.genetics,
			...character.skills.flatMap(skill => [skill.level, skill.xp, skill.prestige]),
		].map(store => store.forceSync(show));
	});
	// a ruleset's genes and their names come with it, once it has loaded
	selectedRuleset.forceSync(id => void loadRuleset(id).then(show));
};
