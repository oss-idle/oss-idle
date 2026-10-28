import { redisKeyPrefix } from './env';
import { redis } from './redis';

/** Local guests, for the admin dashboard only: each device beats while its game is open. */

const SEEN_KEY = `${redisKeyPrefix}guests:seen`;
// ponytail: lost if Redis is wiped; a DB table if the total must outlive it
const ALL_KEY = `${redisKeyPrefix}guests:all`;
const TTL_MS = 5 * 60_000;

export const seeGuest = (id: string): Promise<unknown> =>
	redis.multi().zadd(SEEN_KEY, Date.now(), id).sadd(ALL_KEY, id).exec();

/** Guests with their game open now. */
export const guestCount = async (): Promise<number> => {
	await redis.zremrangebyscore(SEEN_KEY, '-inf', Date.now() - TTL_MS);
	return redis.zcard(SEEN_KEY);
};

/** Guest devices ever seen. */
export const guestTotal = (): Promise<number> => redis.scard(ALL_KEY);
