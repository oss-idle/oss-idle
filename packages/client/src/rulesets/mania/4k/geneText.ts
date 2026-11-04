import {
	ph,
	plural,
	t,
} from '@lingui/core/macro';

import type { GeneText } from '../../ruleset';


export const r = (v: number) => Math.round(v * 100) / 100;

export const xp = (name: () => string, skill: () => string): GeneText => ({
	name, does: n => t`${ph({ value: r(5 * n) })}% ${ph({ skill: skill() })} XP bonus`,
});
export const overdrive = (name: () => string): GeneText => ({
	name, does: n => t`${ph({ value: r(5 * n) })}% overdrive bonus`,
});

export const GENE_TEXT: Record<string, GeneText> = {
	talented: xp(() => t`Talented`, () => t`accuracy`),
	perfectPitch: overdrive(() => t`Perfect pitch`),
	calibrated: {
		name: () => t`Calibrated`,
		does: n => t`${ph({ value: r(30 * n) })}% fewer stray hits`,
	},
	cleanStart: {
		name: () => t`Clean start`,
		does: n => t`the first ${ph({ notes: Math.round(5 * n) })} notes cannot be worse than great`,
	},
	perfectStart: {
		name: () => t`Perfect start`,
		does: n => t`the first ${ph({ notes: Math.round(5 * n) })} notes cannot be worse than perfect`,
	},
	marvelousStart: {
		name: () => t`Marvelous start`,
		does: n => t`the first ${ph({ notes: Math.round(5 * n) })} notes cannot be worse than marvelous`,
	},
	learner: {
		name: () => t`Learner`,
		does: n => t`1 accuracy level for every 10 tries on a map, up to ${ph({ levels: r(n) })}`,
	},
	metronome: {
		name: () => t`Metronome`,
		does: n => n <= 1
			? t`1/1 notes are played with ${ph({ levels: 3 })} more accuracy levels`
			: n <= 2
				? t`1/1 and 1/2 notes are played with ${ph({ levels: 3 })} more accuracy levels`
				: t`1/1, 1/2 and 1/4 notes are played with ${ph({ levels: 3 })} more accuracy levels`,
	},
	chordCohesion: {
		name: () => t`Chord cohesion`,
		does: n => t`${ph({ value: r(5 * n) })}% of the time, the notes of a chord are judged together`,
	},

	tailChaser: xp(() => t`Tail chaser`, () => t`release`),
	holdout: overdrive(() => t`Holdout`),
	lnSpecialist: {
		name: () => t`LN specialist`,
		does: n => t`LN maps give ${ph({ value: r(10 * n) })}% more release XP`,
	},
	lightTouch: {
		name: () => t`Light touch`,
		does: n => t`${ph({ value: r(30 * n) })}% fewer sloppy releases`,
	},
	shieldBreaker: {
		name: () => t`Short holds`,
		does: n => t`${ph({ value: r(15 * n) })}% less chance to hold a short LN too long`,
	},
	quickLetGo: {
		name: () => t`Quick let-go`,
		does: n => t`an LN you hold too long is let go up to ${ph({ ms: r(20 * n) })} ms sooner`,
	},
	steadyRelease: {
		name: () => t`Long Tempo`,
		does: n => t`LNs held over a second are released ${ph({ value: r(7.5 * n) })}% more precisely`,
	},
	lnFlow: {
		name: () => t`LN flow`,
		does: n => t`LN sections can be ${ph({ value: r(20 * n) })}% denser before your releases suffer`,
	},
	catchYourBreath: {
		name: () => t`Catch your breath`,
		does: n => t`you recover ${ph({ value: r(10 * n) })}% faster after a dense LN section`,
	},
	inverse: {
		name: () => t`Inverse`,
		does: n => plural(ph({ levels: r(n) }), {
			one: 'inverse sections are played with # more release level',
			other: 'inverse sections are played with # more release levels',
		}),
	},

	ambidextrous: xp(() => t`Ambidextrous`, () => t`coordination`),
	twoMinds: overdrive(() => t`Two minds`),
	independence: {
		name: () => t`Independence`,
		does: n => t`pressing while holding LNs is ${ph({ value: r(1 * n) })}% easier`,
	},
	handSplit: {
		name: () => t`Hand split`,
		does: n => t`${ph({ value: r(15 * n) })}% of the time, pressing with the hand that holds an LN is no harder than with the other`,
	},
	fullHands: {
		name: () => t`Full hands`,
		does: n => t`holding two or more LNs while you press is ${ph({ value: r(1.5 * n) })}% easier`,
	},
	chordGrip: {
		name: () => t`Chord grip`,
		does: n => t`${ph({ value: r(2 * n) })}% of the time, a chord pressed while holding an LN is no harder than one note`,
	},
	calmHands: {
		name: () => t`Calm hands`,
		does: n => t`holding LNs makes you choke ${ph({ value: r(10 * n) })}% less`,
	},
	composure: {
		name: () => t`Composure`,
		does: n => t`${ph({ value: r(10 * n) })}% fewer tangles when your hands are overloaded`,
	},
	safeFumble: {
		name: () => t`Safe fumble`,
		does: n => t`when your hands tangle, you let go of an LN early instead of missing a note ${ph({ value: r(10 * n) })}% more often`,
	},
	regroup: {
		name: () => t`Regroup`,
		does: n => t`right after a tangle, your hands are ${ph({ value: r(10 * n) })}% calmer`,
	},
	polyrhythm: {
		name: () => t`Unwind`,
		does: n => t`your hands settle ${ph({ value: r(1.2 * n) })}% faster after a busy section`,
	},

	adrenaline: xp(() => t`Adrenaline`, () => t`speed`),
	rush: overdrive(() => t`Rush`),
	quickFingers: {
		name: () => t`Manip`,
		does: n => t`${ph({ value: r(2 * n) })}% fewer misses when your hands are past their limit`,
	},
	cleanStreams: {
		name: () => t`Still sharp`,
		does: n => t`tired hands lose ${ph({ value: r(2.5 * n) })}% less accuracy`,
	},
	pacing: {
		name: () => t`Pacing`,
		does: n => t`your hands tire ${ph({ value: r(4 * n) })}% slower past their limit`,
	},
	burst: {
		name: () => t`Start Burst`,
		does: n => t`your hands tire ${ph({ value: r(10 * n) })}% slower for the first 30 seconds of a song, fading out by 60 seconds`,
	},
	secondHand: {
		name: () => t`Second hand`,
		does: n => t`your hands keep recovering mid-stream, at ${ph({ value: r(1.5 * n) })}% of their resting rate`,
	},
	ceiling: {
		name: () => t`Ceiling`,
		does: n => t`your hands can get ${ph({ value: r(n) })}% less tired`,
	},
	topSpeed: {
		name: () => t`Top speed`,
		does: n => t`your hands' limit is ${ph({ value: r(0.15 * n) })}% higher, about ${ph({ bpm: r(0.3 * n) })} BPM at 200 BPM`,
	},
	comfortZone: {
		name: () => t`Comfort zone`,
		does: n => t`streams up to ${ph({ value: r(1 * n) })}% faster feel comfortable`,
	},

	marathoner: xp(() => t`Marathoner`, () => t`stamina`),
	longHaul: overdrive(() => t`Long haul`),
	slowBurn: {
		name: () => t`Slow burn`,
		does: n => t`you tire ${ph({ value: r(5 * n) })}% slower in dense sections`,
	},
	secondBreath: {
		name: () => t`Second breath`,
		does: n => t`you recover from a tiring section ${ph({ value: r(7.5 * n) })}% faster`,
	},
	grit: {
		name: () => t`Grit`,
		does: n => t`${ph({ value: r(12 * n) })}% fewer misses when you're exhausted`,
	},
	deepLungs: {
		name: () => t`Deep lungs`,
		does: n => t`your stamina lasts ${ph({ seconds: r(60 * n) })} seconds longer in a song`,
	},
	restStops: {
		name: () => t`Rest stops`,
		does: n => t`easy sections give you ${ph({ value: r(20 * n) })}% more stamina back`,
	},
	lowGear: {
		name: () => t`Low gear`,
		does: n => t`running low on stamina starts to hurt ${ph({ value: r(15 * n) })}% later`,
	},
	ironWrists: {
		name: () => t`Iron wrists`,
		does: n => t`running out of stamina makes you miss ${ph({ value: r(30 * n) })}% less`,
	},
	longSets: {
		name: () => t`Hardened`,
		does: n => t`hard maps tire your character ${ph({ value: r(5 * n) })}% less`,
	},
	wellRested: {
		name: () => t`Well rested`,
		does: n => t`past your warm-up peak, your character rests ${ph({ value: r(10 * n) })}% faster between sessions`,
	},
	quickWarmup: {
		name: () => t`Quick warm-up`,
		does: n => t`until your warm-up peak, you warm up ${ph({ value: r(10 * n) })}% faster`,
	},
	stayWarm: {
		name: () => t`Stay warm`,
		does: n => t`you stay warmed up ${ph({ minutes: r(10 * n) })} minutes longer`,
	},

	iceVeins: xp(() => t`Ice veins`, () => t`consistency`),
	coldBlood: overdrive(() => t`Cold blood`),
	steady: {
		name: () => t`Steady`,
		does: n => t`${ph({ value: r(10 * n) })}% fewer chokes`,
	},
	smallChokes: {
		name: () => t`Small chokes`,
		does: n => t`a choke throws your timing off ${ph({ value: r(10 * n) })}% less`,
	},
	cleanReleases: {
		name: () => t`Clean releases`,
		does: () => t`a choke never spoils an LN's release`,
	},
	unshakeable: {
		name: () => t`Unshakeable`,
		does: n => t`hard sections make a choke ${ph({ value: r(10 * n) })}% less likely to be a miss`,
	},
	thickSkin: {
		name: () => t`Thick skin`,
		does: n => t`a section has to be ${ph({ value: r(4 * n) })}% harder before it rattles you`,
	},
	unbothered: {
		name: () => t`Unbothered`,
		does: () => t`SV sections no longer rattle you`,
	},
	flowState: {
		name: () => t`Flow state`,
		does: n => t`on a 100+ combo, ${ph({ value: r(5 * n) })}% fewer chokes`,
	},
	bounceBack: {
		name: () => t`Bounce back`,
		does: n => t`after a miss, ${ph({ value: r(10 * n) })}% fewer chokes for ${ph({ seconds: r(5 * n) })} seconds`,
	},
	clutch: {
		name: () => t`Clutch`,
		does: n => t`in the last ${ph({ value: r(10 * n) })}% of a song, a choke is ${ph({ value: r(10 * n) })}% less likely to be a miss`,
	},

	hammer: xp(() => t`Hammer`, () => t`jack speed`),
	anvil: overdrive(() => t`Anvil`),
	anchor: {
		name: () => t`Anchor`,
		does: n => t`you fall behind ${ph({ value: r(5 * n) })}% less in fast jacks`,
	},
	bounce: {
		name: () => t`Bounce`,
		does: n => t`when you fall behind on jacks, you catch up ${ph({ value: r(15 * n) })}% more often`,
	},
	freshFingers: {
		name: () => t`Fresh fingers`,
		does: n => t`your fingers stay fresh ${ph({ value: r(3 * n) })}% longer in jacks`,
	},
	shortRest: {
		name: () => t`Short rest`,
		does: n => t`your fingers get fresh again ${ph({ value: r(1.2 * n) })}% sooner after a jack section`,
	},
	jackCeiling: {
		name: () => t`Jack ceiling`,
		does: n => t`your top jack speed is ${ph({ value: r(0.25 * n) })}% higher`,
	},
	easyJacks: {
		name: () => t`Easy jacks`,
		does: n => t`jacks up to ${ph({ value: r(1.2 * n) })}% faster feel comfortable`,
	},
	minijacks: {
		name: () => t`Minijacks`,
		does: n => t`a key hit twice in a row gets ${ph({ value: r(0.5 * n) })}% more slack`,
	},
	chordjack: {
		name: () => t`Chordjack`,
		does: n => t`chord jacks strain you ${ph({ value: r(5 * n) })}% less`,
	},

	sightReader: xp(() => t`Sight reader`, () => t`technical`),
	secondGlance: overdrive(() => t`Second glance`),
	patternSense: {
		name: () => t`Pattern sense`,
		does: n => t`you recover from hard patterns ${ph({ value: r(1 * n) })}% faster`,
	},
	steadyEyes: {
		name: () => t`Steady eyes`,
		does: n => t`${ph({ value: r(12 * n) })}% fewer misses on patterns past your limit`,
	},
	overview: {
		name: () => t`Overview`,
		does: n => t`past your limit, misses build up ${ph({ value: r(12 * n) })}% more gradually`,
	},
	rhythmSense: {
		name: () => t`Rhythm sense`,
		does: n => t`rhythm changes are ${ph({ value: r(1.5 * n) })}% easier`,
	},
	offBeat: {
		name: () => t`Off-beat`,
		does: n => t`switching between snaps (1/3 or 1/6 among 1/4) is ${ph({ value: r(n) })}% easier`,
	},
	crossHand: {
		name: () => t`Cross-hand`,
		does: n => t`rhythm changes that jump to the other hand are ${ph({ value: r(n) })}% easier`,
	},
	shapeReading: {
		name: () => t`Shape reading`,
		does: n => t`changing chord shapes are ${ph({ value: r(1 * n) })}% easier`,
	},
	trillHands: {
		name: () => t`Trill hands`,
		does: n => t`trills are ${ph({ value: r(1.5 * n) })}% easier`,
	},
	settleIn: {
		name: () => t`Settle in`,
		does: n => plural(ph({ chords: Math.ceil(n) }), {
			one: 'you settle into a steady rhythm # chord sooner',
			other: 'you settle into a steady rhythm # chords sooner',
		}),
	},
	familiarShapes: {
		name: () => t`Familiar shapes`,
		does: n => t`you remember ${ph({ shapes: Math.round(3 * n) })} more of the song's recent chord shapes`,
	},

	waveRider: xp(() => t`Wave rider`, () => t`speed jam`),
	undertow: overdrive(() => t`Undertow`),
	speedReader: {
		name: () => t`Speed reader`,
		does: n => t`a slight edge: notes that rush in are ${ph({ value: r(0.2 * n) })}% easier`,
	},
	brake: {
		name: () => t`Brake`,
		does: n => t`notes that slow down are ${ph({ value: r(0.5 * n) })}% easier`,
	},
	lateLook: {
		name: () => t`Late look`,
		does: n => t`a slight edge: how notes move far up the screen throws you off ${ph({ value: r(0.2 * n) })}% less`,
	},
	dejaVu: {
		name: () => t`Déjà vu`,
		does: n => t`${ph({ value: r(3 * n) })}% of the time, you recognise an SV pattern from further back in the song`,
	},
	looseMatch: {
		name: () => t`Loose match`,
		does: n => t`SV patterns can differ ${ph({ value: r(0.5 * n) })}% more and still count as repeats`,
	},
	oldNews: {
		name: () => t`Old news`,
		does: n => t`a repeated SV pattern is ${ph({ value: r(2 * n) })}% easier still`,
	},
	shakeItOff: {
		name: () => t`Shake it off`,
		does: n => t`a slight edge: you recover from an SV section ${ph({ value: r(0.25 * n) })}% faster`,
	},
	softLanding: {
		name: () => t`Soft landing`,
		does: n => t`a slight edge: ${ph({ value: r(0.25 * n) })}% fewer misses in SV past your limit`,
	},
	svSurfer: {
		name: () => t`SV surfer`,
		does: n => t`SV pushes your hits early or late ${ph({ value: r(5 * n) })}% less`,
	},

	thoroughLearner: xp(() => t`Thorough learner`, () => t`memory`),
	prodigy: overdrive(() => t`Prodigy`),
	beatmapStudy: {
		name: () => t`Beatmap study`,
		does: n => t`learn maps ${ph({ value: r(10 * n) })}% faster`,
	},
	learnFromFailure: {
		name: () => t`Learn from failure`,
		does: n => t`a failed play teaches you as much as ${ph({ value: r(20 * n) })}% of a pass`,
	},
	educatedGuess: {
		name: () => t`Educated guess`,
		does: n => t`playing a map teaches you ${ph({ value: r(10 * n) })}% of the other difficulties in its set with the same song`,
	},
	mapperAdvantage: {
		name: () => t`Mapper advantage`,
		does: n => t`maps by a mapper you know well are learned ${ph({ value: r(10 * n) })}% faster`,
	},
	longMemory: {
		name: () => t`Long memory`,
		does: n => t`you forget maps ${ph({ value: r(10 * n) })}% slower`,
	},
	personalFavorites: {
		name: () => t`Personal favorites`,
		does: n => plural(ph({ maps: Math.ceil(n) }), {
			one: 'your most played map never fades',
			other: 'your # most played maps never fade',
		}),
	},
	muscleMemory: {
		name: () => t`Muscle memory`,
		does: n => t`after prestige you still remember ${ph({ value: r(10 * n) })}% of what you'd learned`,
	},
	accurateMemory: {
		name: () => t`Accurate memory`,
		does: n => plural(ph({ levels: r(n) }), {
			one: 'a map you know by heart is played with # more accuracy level',
			other: 'a map you know by heart is played with # more accuracy levels',
		}),
	},

	deepFocus: xp(() => t`Deep focus`, () => t`concentration`),
	inTheZone: overdrive(() => t`In the zone`),
	attentionSpan: {
		name: () => t`Attention span`,
		does: n => t`you stay sharp ${ph({ seconds: r(5 * n) })} s longer before your focus slips`,
	},
	slowFade: {
		name: () => t`Slow fade`,
		does: n => t`when your focus slips, it fades ${ph({ value: r(20 * n) })}% more gradually`,
	},
	lostInTheMusic: {
		name: () => t`Lost in the music`,
		does: n => t`you stay sharp ${ph({ value: r(10 * n) })}% longer on songs you've played 10+ times`,
	},
	steadyHands: {
		name: () => t`Steady hands`,
		does: n => t`once your focus slips, your timing swings back and forth ${ph({ value: r(10 * n) })}% less`,
	},
	anchored: {
		name: () => t`Anchored`,
		does: n => t`once your focus slips, your timing wanders early or late ${ph({ value: r(10 * n) })}% less`,
	},
	secondWind: {
		name: () => t`Second wind`,
		does: n => t`a pause of 5 s or more in the song gives you back ${ph({ seconds: r(5 * n) })} s of focus`,
	},
	catnap: {
		name: () => t`Catnap`,
		does: n => t`pauses as short as ${ph({ seconds: r(5 - 0.5 * n) })} s also give you focus back`,
	},
	freshStart: {
		name: () => t`Fresh start`,
		does: () => t`a pause of 15 s or more gives your focus back in full`,
	},
	finalStretch: {
		name: () => t`Final stretch`,
		does: n => t`in the last 30 s of a song, your focus comes back ${ph({ value: r(20 * n) })}%`,
	},
};
