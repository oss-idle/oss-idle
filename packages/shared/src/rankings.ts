/** Rows per ranking page, on the server and the pages that number them. */
export const PAGE_SIZE = 50;

/** What a beatmap's leaderboard is ordered by: score (the one that holds #1s) or pp. */
export const BOARD_SORTS = ['score', 'pp'] as const;
export type BoardSort = typeof BOARD_SORTS[number];
