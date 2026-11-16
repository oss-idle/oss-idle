import {
	createHash,
	timingSafeEqual,
} from 'node:crypto';

const digest = (text: string) => createHash('sha256').update(text).digest();

/** Whether the stream machine sent this server's key: by digest, in constant time. */
export const keyMatches = (given: string, key: string): boolean =>
	timingSafeEqual(digest(given), digest(key));
