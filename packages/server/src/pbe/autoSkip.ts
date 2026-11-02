import {
	isPbe,
	redisKeyPrefix,
} from '../env';
import { redis } from '../redis';

const key = (characterId: number) => `${redisKeyPrefix}pbe:autoSkip:${characterId}`;

/** The character's plays skip to the end. Kept in Redis: this setting needs no column. */
export const autoSkipOf = async (characterId: number): Promise<boolean> =>
	isPbe && await redis.exists(key(characterId)) === 1;

export const setAutoSkip = async (characterId: number, on: boolean): Promise<void> => {
	if (!isPbe) return;
	if (on) await redis.set(key(characterId), '1');
	else await redis.del(key(characterId));
};
