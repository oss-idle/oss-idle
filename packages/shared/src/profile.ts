import { z } from 'zod';

/** The profile blocks a supporter can reorder, in their default order. */
export const PROFILE_SECTIONS = [
	'me', 'recent', 'skills', 'ranks', 'historical', 'beatmaps', 'medals',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

const isSection = (s: string): s is ProfileSection =>
	PROFILE_SECTIONS.includes(s as ProfileSection);

/** A saved order, with sections it doesn't know (added since) at the end. */
export const profileOrder = (saved: readonly string[] = []): ProfileSection[] => {
	const known = saved.filter(isSection);
	return [...known, ...PROFILE_SECTIONS.filter(s => !known.includes(s))];
};

export const USER_PAGE_MAX = 60000;

export const userPageBody = z.object({
	characterId: z.number().int().positive(),
	raw: z.string().max(USER_PAGE_MAX),
});

export const profileOrderBody = z.object({
	characterId: z.number().int().positive(),
	order: z.array(z.enum(PROFILE_SECTIONS))
		.refine(o => new Set(o).size === o.length, 'Duplicate section'),
});
