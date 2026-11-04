import {
	ph,
	plural,
	t,
} from '@lingui/core/macro';

import { GENES_7K } from '@oss-idle/shared/rulesets/mania/7k/genes';

import type { GeneText } from '../../ruleset';
import {
	GENE_TEXT,
	overdrive,
	r,
	xp,
} from '../4k/geneText';

/** 7K's own genes, and 4K's where 7K's skill words differ. */
const OWN: Record<string, GeneText> = {
	busyHands: {
		name: () => t`Busy hands`,
		does: n => t`a hand pressing fast throws your timing off ${ph({ value: r(10 * n) })}% less`,
	},
	outerFingers: {
		name: () => t`Outer fingers`,
		does: n => plural(ph({ levels: r(n) }), {
			one: 'your ring fingers and thumb play with # more accuracy level',
			other: 'your ring fingers and thumb play with # more accuracy levels',
		}),
	},

	tailChaser: xp(() => t`Tail chaser`, () => t`LN`),
	lnSpecialist: {
		name: () => t`LN specialist`,
		does: n => t`LN maps give ${ph({ value: r(10 * n) })}% more LN XP`,
	},
	patience: {
		name: () => t`Patience`,
		does: n => t`${ph({ value: r(15 * n) })}% less chance to let an LN go too early`,
	},
	letGoTogether: {
		name: () => t`Let go together`,
		does: n => t`letting go of several LNs at once is ${ph({ value: r(10 * n) })}% easier`,
	},
	cleanLift: {
		name: () => t`Clean lift`,
		does: n => t`letting go while the same hand presses another key is ${ph({ value: r(10 * n) })}% easier`,
	},
	lnFlow: {
		name: () => t`LN flow`,
		does: n => t`LN sections can be ${ph({ value: r(2 * n) })}% denser before your releases suffer`,
	},
	holdOn: {
		name: () => t`Hold on`,
		does: n => t`past your limit, ${ph({ value: r(10 * n) })}% fewer releases slip away`,
	},

	ambidextrous: xp(() => t`Ambidextrous`, () => t`independence`),
	splitFocus: {
		name: () => t`Split focus`,
		does: n => t`pressing while holding LNs is ${ph({ value: r(n) })}% easier`,
	},
	handsApart: {
		name: () => t`Hands apart`,
		does: n => t`LNs held by the other hand bother you ${ph({ value: r(10 * n) })}% less`,
	},
	fullHands: {
		name: () => t`Full hands`,
		does: n => t`holding two or more LNs in the pressing hand is ${ph({ value: r(1.5 * n) })}% easier`,
	},
	looseFingers: {
		name: () => t`Loose fingers`,
		does: n => t`holding with the middle or ring finger is ${ph({ value: r(4 * n) })}% easier`,
	},
	firmGrip: {
		name: () => t`Firm grip`,
		does: n => t`held fingers lift ${ph({ value: r(10 * n) })}% less often as you press`,
	},
	inversePress: {
		name: () => t`Inverse`,
		does: n => t`a key pressed right after its LN ends, while the hand holds another, is ${ph({ value: r(10 * n) })}% easier`,
	},

	rollingHands: {
		name: () => t`Rolling hands`,
		does: n => t`rolls and stairs across one hand are ${ph({ value: r(10 * n) })}% lighter`,
	},
	chordPress: {
		name: () => t`Chord press`,
		does: n => t`big chords are ${ph({ value: r(10 * n) })}% lighter on your hands`,
	},

	chordEndurance: {
		name: () => t`Chord endurance`,
		does: n => t`chords tire you ${ph({ value: r(5 * n) })}% less`,
	},

	hammer: xp(() => t`Hammer`, () => t`jacks`),
	pump: {
		name: () => t`Pump`,
		does: n => t`a hand can jack chords ${ph({ value: r(n) })}% faster before it strains`,
	},
	trainedFingers: {
		name: () => t`Trained fingers`,
		does: n => t`your ring fingers and thumb jack ${ph({ value: r(2 * n) })}% closer to your index`,
	},
	strongMiddle: {
		name: () => t`Strong middle`,
		does: () => t`your middle fingers jack as fast as your index`,
	},

	twoRhythms: {
		name: () => t`Two rhythms`,
		does: n => t`hands on rhythms that don't fit together (3 against 2) are ${ph({ value: r(5 * n) })}% easier`,
	},
	graceNotes: {
		name: () => t`Grace notes`,
		does: n => t`quick double notes on one key are ${ph({ value: r(5 * n) })}% easier to read`,
	},

	waveRider: xp(() => t`Wave rider`, () => t`SV`),
	deepFocus: xp(() => t`Deep focus`, () => t`focus`),
	inTheZone: overdrive(() => t`In the zone`),
};

export const GENE_TEXT_7K: Record<string, GeneText> = Object.fromEntries(
	GENES_7K.map(g => [g.id, OWN[g.id] ?? GENE_TEXT[g.id]]),
);
