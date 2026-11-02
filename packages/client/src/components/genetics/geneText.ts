import { selectedGenetics } from '../../rulesets/registry';

/** A gene's name and what it does, in the picked ruleset's words. */
export const geneName = (id: string): string => selectedGenetics()?.genes[id]?.name() ?? id;
export const geneDoes = (id: string, n: number): string =>
	selectedGenetics()?.genes[id]?.does(n) ?? '';
