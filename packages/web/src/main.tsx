import '@oss-idle/shared/shared.css';
import './font.css';
import './styles.css';

import type { MessageDescriptor } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { moveHost } from '@oss-idle/shared/hostMove';

import PageError from './components/PageError';
import {
	activateLocale,
	i18n,
} from './i18n';
import { savedLocale } from './locale';
import { routeTree } from './routeTree.gen';

await moveHost();

// A tab opened before a deploy asks for chunks the new build removed.
window.addEventListener('vite:preloadError', (event) => {
	const key = 'preload-reload';
	try {
		if (Number(sessionStorage.getItem(key)) > Date.now() - 10_000) return;
		sessionStorage.setItem(key, String(Date.now()));
	} catch { return; }
	event.preventDefault();
	window.location.reload();
});

// Load the catalog before first render so the UI never flashes message keys.
await activateLocale(savedLocale());

const router = createRouter({
	routeTree,
	basepath: '/web',
	defaultPreload: 'intent',
	defaultNotFoundComponent: () => <PageError />,
	defaultErrorComponent: ({ error }) => <PageError error={error} />,
});

declare module '@tanstack/react-router' {
	interface Register { router: typeof router; }
	// Per-route page heading, translated lazily in the root layout.
	interface StaticDataRouteOption { title?: MessageDescriptor; }
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<I18nProvider i18n={i18n}>
			<RouterProvider router={router} />
		</I18nProvider>
	</StrictMode>,
);
