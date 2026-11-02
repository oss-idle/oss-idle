/** osu!'s beatmap panels: a two-column grid, three rows of it first. */
export const MAP_PAGE = 6;

/** osu!'s profile lists: `first` rows first (5 by default), then 50 per "Show more". One extra
 *  row tells whether more are left. */
export const profilePage = async <T>(
	page: number,
	query: (offset: number, limit: number) => PromiseLike<T[]>,
	first = 5,
) => {
	const limit = page === 1 ? first : 50;
	const rows = await query(page === 1 ? 0 : first + ((page - 2) * 50), limit + 1);
	return {
		items: rows.slice(0, limit), hasMore: rows.length > limit, 
	};
};
