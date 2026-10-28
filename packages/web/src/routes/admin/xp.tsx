import { msg } from '@lingui/core/macro';
import {
	createFileRoute,
	lazyRouteComponent,
} from '@tanstack/react-router';

export const Route = createFileRoute('/admin/xp')({
	component: lazyRouteComponent(() => import('../../pages/admin/xpGains/XpGains')),
	staticData: { title: msg`XP gains` },
});
