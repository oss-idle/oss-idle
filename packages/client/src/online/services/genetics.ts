import {
	convert,
	type Gene,
	geneOf,
	type Genetics,
	type GeneticsDef,
	geneticSlots,
	geneticsXpMultiplier,
	learn,
	pick,
	type PlayLevels,
	sell,
} from '@oss-idle/shared/genetics';
import Log from '@oss-idle/shared/helpers/log';

import type Character from '../../db/schema/character';
import Entities from '../../entity/entities';
import { PBE } from '../../pbe/pbe';
import { selectedDef } from '../../rulesets/registry';
import Account from '../account';
import { rpc } from '../client';
import { sendCharacterAction } from './characterAction';

/** Each skill's play level: what its milestones read. */
export const playLevels = (character: Character): PlayLevels =>
	Object.fromEntries(character.skills.map(s => [s.name, s.playLevel()]));

/** The genes a local character can use: in a play, genes work for online characters alone. */
export const worksLocally = (gene: Gene | undefined) =>
	gene?.effect === 'xp' || gene?.effect === 'overdrive';

/** Each skill's XP scaling from a local character's genetics. */
export const geneticsXp = (character: Character): Record<string, number> | undefined => {
	const def = selectedDef().genetics;
	const g = character.genetics.get();
	if (!def || !g.picks.length) return undefined;
	return Object.fromEntries(character.skills.map(s =>
		[s.name, geneticsXpMultiplier(def, g, s.name)]));
};

/** Change the live character's genetics. It shows at once: a local character keeps it, a
 *  signed-in one has the server confirm it, and is read back from the server if it refuses. */
const change = async (
	what: string,
	local: (def: GeneticsDef, g: Genetics, character: Character) => Genetics,
	online: () => Parameters<typeof sendCharacterAction>[1],
): Promise<boolean> => {
	const character = Entities.character.get();
	const def = selectedDef().genetics;
	if (character.id === 0 || !def) return false;
	let next: Genetics;
	try {
		next = local(def, character.genetics.get(), character);
	} catch (e) {
		Log.errorPopup(`${what} failed: ${e instanceof Error ? e.message : e}`);
		return false;
	}
	if (character.isGuest()) {
		await character.saveGenetics(next);
		return true;
	}
	await character.genetics.set(next);
	const done = await sendCharacterAction(what, online(), () => true);
	if (!done) await Account.refresh();
	return done;
};

export const pickGenetic = (skill: string, slot?: number) => change(
	'Genetic',
	(def, g, character) =>
		pick(def, g, skill, Date.now(), geneticSlots(character.generation), slot, PBE),
	() => rpc.v1.me.genetics.pick.$post({
		json: {
			skill, ...slot === undefined ? {} : { slot },
		},
	}),
);

export const learnGene = (gene: string) => change(
	'Gene',
	(def, g, character) => {
		if (character.isGuest() && !worksLocally(geneOf(def, gene))) throw new Error('online characters only');
		return learn(def, g, gene, playLevels(character));
	},
	() => rpc.v1.me.genetics.learn.$post({ json: { gene } }),
);

export const sellGene = (gene: string) => change(
	'Selling',
	(def, g, character) => sell(def, g, gene, playLevels(character)),
	() => rpc.v1.me.genetics.sell.$post({ json: { gene } }),
);

/** Turn all of a skill's overdrive into climaxx. */
export const convertOverdrive = (skillName: string) => change(
	'Overdrive',
	(_def, g, character) => {
		const skill = character.skills.find(s => s.name === skillName);
		const overdrive = skill?.overdrive.get() ?? 0;
		if (!skill || overdrive <= 0) throw new Error('no overdrive');
		void skill.overdrive.set(0);
		if (character.isGuest()) void character.persistSkills();
		return convert(g, skillName, overdrive);
	},
	() => rpc.v1.me.genetics.convert.$post({ json: { skill: skillName } }),
);
