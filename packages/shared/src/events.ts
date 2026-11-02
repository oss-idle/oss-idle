import type { Grade } from './grade.js';

/** osu!web's profile events, the ones oss! has: what each one stores. */
export type EventData =
	| { type: 'achievement', medalId: string }
	| { type: 'rank', beatmapId: number, rank: number, grade: Grade }
	| { type: 'rankLost', beatmapId: number }
	| { type: 'beatmapsetUpload' | 'beatmapsetUpdate', setId: number }
	| { type: 'beatmapsetApprove', setId: number, status: 'ranked' | 'loved' }
	| { type: 'beatmapPlaycount', beatmapId: number, count: number }
	| { type: 'userSupportFirst' | 'userSupportAgain' | 'userSupportGift' }
	| { type: 'usernameChange', previousUsername: string, username: string };

export type EventType = EventData['type'];

/** A beatmap's play counts that make news on its mapper's profile. */
export const PLAYCOUNT_MILESTONES = [
	100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
];

/** An osu!web event names a top play this high on its map's leaderboard. */
export const RANK_EVENT_MAX = 50;
