import {
	createFileRoute,
	redirect,
} from '@tanstack/react-router';

// links from before scores took their ruleset were all 4K
export const Route = createFileRoute('/scores/$id')({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/scores/$ruleset/$id', params: {
				ruleset: 'mania4k', id: params.id, 
			}, replace: true,
		});
	},
});
