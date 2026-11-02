import { GOOD_GRADE } from '@oss-idle/shared/grade';

/** The boards of the rankings nav, each at its first page's address. */
export const BOARD_LINKS = [
	{
		id: 'global', to: '/rankings/global',
	},
	{
		id: 'skills', to: '/rankings/skills/$skill', params: { skill: 'overall' },
	},
	{
		id: 'lifetime', to: '/rankings/lifetime/$skill', params: { skill: 'overall' },
	},
	{
		id: 'prestige', to: '/rankings/prestige/$skill', params: { skill: 'overall' },
	},
	{
		id: 'grades', to: '/rankings/grades/$grade', params: { grade: GOOD_GRADE.X },
	},
	{
		id: 'medals', to: '/rankings/medals',
	},
	{
		id: 'country', to: '/rankings/country',
	},
	{
		id: 'top plays', to: '/rankings/plays',
	},
] as const;
