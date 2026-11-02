import type {
	Gene,
	GeneEffect,
	GeneticsDef,
} from '../../../genetics.js';
import {
	SKILL,
	type SkillName,
} from './skills.js';

/** The skills around the ring: each one's neighbours are next to it. */
export const RING: readonly SkillName[] = [
	SKILL.accuracy,
	SKILL.release,
	SKILL.coordination,
	SKILL.speed,
	SKILL.stamina,
	SKILL.consistency,
	SKILL.jackspeed,
	SKILL.reading,
	SKILL.speedjam,
	SKILL.memory,
	SKILL.concentration,
];

type Row = [id: string, parent: string, max: number, effect?: GeneEffect, per?: number];

/** Every tree starts with an XP gene and its overdrive gene. */
const tree = (skill: SkillName, xp: string, overdrive: string, rows: Row[]): Gene[] =>
	([
		[xp, '', 5, 'xp', 0.05],
		[overdrive, xp, 5, 'overdrive', 0.05],
		...rows,
	] satisfies Row[]).map(([id, parent, max, effect, per]: Row) => ({
		id,
		skill,
		max,
		...parent ? { parent } : {},
		...effect ? {
			effect, per, 
		} : {},
	}));

export const GENES: readonly Gene[] = [
	...tree(SKILL.accuracy, 'talented', 'perfectPitch', [
		['calibrated', '', 3],
		['cleanStart', 'calibrated', 5],
		['perfectStart', 'cleanStart', 5],
		['marvelousStart', 'perfectStart', 5],
		['learner', 'cleanStart', 5],
		['metronome', 'calibrated', 3],
		['chordCohesion', 'metronome', 5],
	]),
	...tree(SKILL.release, 'tailChaser', 'holdout', [
		['lnSpecialist', 'tailChaser', 5, 'lnXp', 0.1],
		['lightTouch', '', 3],
		['shieldBreaker', 'lightTouch', 5],
		['quickLetGo', 'shieldBreaker', 5],
		['steadyRelease', 'lightTouch', 5],
		['lnFlow', '', 5],
		['catchYourBreath', 'lnFlow', 5],
		['inverse', 'lnFlow', 5],
	]),
	...tree(SKILL.coordination, 'ambidextrous', 'twoMinds', [
		['independence', '', 5],
		['handSplit', 'independence', 5],
		['fullHands', 'handSplit', 5],
		['chordGrip', 'independence', 5],
		['calmHands', 'independence', 5],
		['composure', '', 5],
		['safeFumble', 'composure', 5],
		['regroup', 'composure', 5],
		['polyrhythm', 'regroup', 5],
	]),
	...tree(SKILL.speed, 'adrenaline', 'rush', [
		['quickFingers', '', 5],
		['cleanStreams', 'quickFingers', 5],
		['pacing', '', 5],
		['burst', 'pacing', 5],
		['secondHand', 'pacing', 5],
		['ceiling', 'secondHand', 5],
		['topSpeed', '', 5],
		['comfortZone', 'topSpeed', 5],
	]),
	...tree(SKILL.stamina, 'marathoner', 'longHaul', [
		['slowBurn', '', 5],
		['secondBreath', 'slowBurn', 5],
		['grit', 'slowBurn', 5],
		['deepLungs', '', 5],
		['restStops', 'deepLungs', 5],
		['lowGear', 'restStops', 5],
		['ironWrists', 'lowGear', 3],
		['longSets', '', 5, 'strainRate', 0.05],
		['wellRested', 'longSets', 5, 'restRate', 0.1],
		['quickWarmup', 'longSets', 5, 'warmRate', 0.1],
		['stayWarm', 'quickWarmup', 5, 'warmHold', 10],
	]),
	...tree(SKILL.consistency, 'iceVeins', 'coldBlood', [
		['steady', '', 5],
		['smallChokes', 'steady', 5],
		['cleanReleases', 'smallChokes', 1],
		['unshakeable', '', 5],
		['thickSkin', 'unshakeable', 5],
		['unbothered', 'unshakeable', 1],
		['flowState', '', 5],
		['bounceBack', 'flowState', 5],
		['clutch', 'flowState', 5],
	]),
	...tree(SKILL.jackspeed, 'hammer', 'anvil', [
		['anchor', '', 5],
		['bounce', 'anchor', 5],
		['freshFingers', '', 5],
		['shortRest', 'freshFingers', 5],
		['jackCeiling', '', 5],
		['easyJacks', 'jackCeiling', 5],
		['minijacks', 'easyJacks', 5],
		['chordjack', '', 5],
	]),
	...tree(SKILL.reading, 'sightReader', 'secondGlance', [
		['patternSense', '', 5],
		['steadyEyes', 'patternSense', 5],
		['overview', 'steadyEyes', 5],
		['rhythmSense', '', 5],
		['offBeat', 'rhythmSense', 5],
		['crossHand', 'rhythmSense', 5],
		['shapeReading', '', 5],
		['trillHands', 'shapeReading', 5],
		['settleIn', 'shapeReading', 3],
		['familiarShapes', 'settleIn', 5],
	]),
	...tree(SKILL.speedjam, 'waveRider', 'undertow', [
		['speedReader', '', 5],
		['brake', 'speedReader', 5],
		['lateLook', 'speedReader', 5],
		['dejaVu', '', 5],
		['looseMatch', 'dejaVu', 5],
		['oldNews', 'dejaVu', 5],
		['shakeItOff', '', 5],
		['softLanding', 'shakeItOff', 5],
		['svSurfer', 'softLanding', 5],
	]),
	...tree(SKILL.memory, 'thoroughLearner', 'prodigy', [
		['beatmapStudy', '', 5],
		['learnFromFailure', 'beatmapStudy', 5, 'failShare', 0.2],
		['educatedGuess', 'beatmapStudy', 5, 'setShare', 0.1],
		['mapperAdvantage', 'educatedGuess', 5, 'mapperRate', 0.1],
		['longMemory', '', 5, 'fade', 0.1],
		['personalFavorites', 'longMemory', 5, 'favorites', 1],
		['muscleMemory', 'longMemory', 5, 'keep', 0.1],
		['accurateMemory', 'muscleMemory', 5],
	]),
	...tree(SKILL.concentration, 'deepFocus', 'inTheZone', [
		['attentionSpan', '', 5],
		['slowFade', 'attentionSpan', 5],
		['lostInTheMusic', 'attentionSpan', 5],
		['steadyHands', '', 5],
		['anchored', 'steadyHands', 5],
		['secondWind', '', 5],
		['catnap', 'secondWind', 5],
		['freshStart', 'secondWind', 1],
		['finalStretch', '', 5],
	]),
];

export const GENETICS_4K: GeneticsDef = {
	ring: RING, genes: GENES, 
};
