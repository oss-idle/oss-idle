import Synced from '@oss-idle/shared/helpers/synced';
import {
	allowedRate,
	RATE_STEP,
	rateUnlocks,
} from '@oss-idle/shared/rate';
import type SkillState from '@oss-idle/shared/rulesets/skillState';

import type Character from '../db/schema/character';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import type { PlayContext } from '../online/play';
import { selectedDefLoaded } from '../rulesets/registry';

const speedOf = (character: Character): SkillState | undefined =>
	character.skills.find(s => s.name === selectedDefLoaded()?.rateSkill);

/** The rate steps the character has unlocked: Speed upgrades plus prestiges. */
export const speedUpgrades = (character: Character): number => {
	const speed = speedOf(character);
	return speed ? rateUnlocks(speed.upgrades.get(), speed.prestige.get()) : 0;
};

/** The rate a play of this character starts at: the playlist's locked one, else
 *  the one picked, held to what its Speed upgrades unlock. */
export const rateFor = (character: Character, lockedRate?: number): number =>
	allowedRate(lockedRate ?? SETTINGS.rate.get(), speedUpgrades(character));

/** The live character's rate: song select's music and the next play follow it. */
export const selectedRate = new Synced(1);

/** The live character's Speed upgrades: what decides which rates it can play. */
export const liveSpeedUpgrades = new Synced(0);

/** Whether the live character can play at a locked rate (no lock: always). */
export const canPlayAt = (lockedRate?: number): boolean =>
	lockedRate === undefined || allowedRate(lockedRate, liveSpeedUpgrades.get()) === lockedRate;

const update = () => {
	const character = Entities.character.get();
	void liveSpeedUpgrades.set(speedUpgrades(character));
	void selectedRate.set(rateFor(character));
};
let watched: SkillState | undefined;
void Entities.character.sync(character => {
	watched?.upgrades.desync(update);
	watched?.prestige.desync(update);
	watched = speedOf(character);
	void watched?.upgrades.sync(update);
	void watched?.prestige.sync(update);
	update();
});
void SETTINGS.rate.sync(update);

/** The rate a play runs at. A debug play has no session: it takes the one picked. */
export const rateOfPlay = (play: PlayContext): number =>
	play.mode === 'debug' ? selectedRate.get() : play.rate;

/** Pick a rate, held to what the live character has unlocked, and remember it as its
 *  side's last one. */
export const pickRate = (rate: number): void => {
	const next = allowedRate(rate, speedUpgrades(Entities.character.get()));
	void SETTINGS.rate.set(next);
	if (next > 1) void SETTINGS.fasterRate.set(next);
	if (next < 1) void SETTINGS.slowerRate.set(next);
};

/** One step faster (1) or slower (-1), across x1 too: the Ctrl shortcuts. */
export const stepRate = (direction: 1 | -1): void =>
	pickRate(selectedRate.get() + direction * RATE_STEP);
