import type { RosterCharacter } from '@oss-idle/shared/roster';

/** Adri was reborn in 4K: Adri plays 4K, Adri_old still plays 7K. */
export const REBORN_ROSTER: RosterCharacter[] = [
	{
		id: 1,
		name: 'Adri_old',
		cells: {
			mania4k: {
				generation: 1,
				overall: 162,
				queue: {
					state: 'stopped', maps: 12, seconds: 2410,
				},
			},
			mania7k: {
				generation: 1,
				overall: 54,
				queue: {
					state: 'playing', title: 'Blue Zenith', maps: 214, seconds: 42_130,
				},
			},
		},
	},
	{
		id: 2,
		name: 'Adri',
		cells: {
			mania4k: {
				generation: 2,
				overall: 87,
				queue: {
					state: 'playing', title: 'Godslain', maps: 5, seconds: 2520,
				},
			}, 
		},
	},
];

/** One character, 7K paused. */
export const FIRST_ROSTER: RosterCharacter[] = [{
	id: 2,
	name: 'Adri',
	cells: {
		mania4k: {
			generation: 1,
			overall: 64,
			queue: {
				state: 'playing', title: 'Far east nightbird', maps: 38, seconds: 7905,
			},
		},
		mania7k: {
			generation: 1,
			overall: 12,
			queue: {
				state: 'paused', maps: 3, seconds: 611,
			},
		},
	},
}];
