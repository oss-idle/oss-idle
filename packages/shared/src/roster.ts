import type { RulesetId } from './rulesets/ids.js';

/** A slot's queue: running (shown or played with the game closed), held, or left. */
export type RosterQueue = {
	state: 'playing' | 'paused' | 'stopped',
	/** the map playing now */
	title?: string,
	maps: number,
	/** one pass through the queue */
	seconds: number,
};

/** A character in one ruleset. */
export type RosterCell = {
	generation: number,
	overall: number,
	queue?: RosterQueue,
};

/** A character in every ruleset it may play: none for one it is locked out of. */
export type RosterCharacter = {
	id: number,
	name: string,
	cells: Partial<Record<RulesetId, RosterCell>>,
};
