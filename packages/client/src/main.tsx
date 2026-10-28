import '@oss-idle/shared/shared.css';
import './index.css';
import './zindex.css';
import './online/account'; // resolve the session + account, listen for login
import './addons/host'; // globalThis.ossIdle, before any add-on loads

import { I18nProvider } from '@lingui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { desktop } from '@oss-idle/shared/desktop';

import { startAutoUpdates } from './addons/autoUpdate';
import { bootAddons } from './addons/runtime';
import App from './App.tsx';
import { SETTINGS } from './db/settings';
import {
	DEV_TOOLS,
	devTools,
} from './dev/devTools';
import {
	activateLocale,
	i18n,
} from './i18n';
import { startGuestBeat } from './online/guestBeat';
import { watchMapFolders } from './osu/beatmap/diskSync';
import { watchSkinFolders } from './osu/skin/skinFolders';
import { initFrameLimiter } from './responsive/frameLimiter';
import { initFullscreen } from './responsive/fullscreen';
import { initWakeLock } from './responsive/wakeLock';

initWakeLock(); // keep mobile screens awake while playing
initFullscreen(); // keep the fullscreen setting in sync with Esc/F11
initFrameLimiter(); // cap every rAF loop to the frame limiter setting
void bootAddons().then(startAutoUpdates); // mount enabled installed add-ons
void watchMapFolders();
void watchSkinFolders();
startGuestBeat();
SETTINGS.uiScale.forceSync(scale => desktop()?.setZoomFactor?.(scale));

// dev tools; the static DEV_TOOLS drops them from a release build. The profiler
// loads after the frame limiter so it times every rAF.
if (DEV_TOOLS && devTools.testBridge) void import('./dev/testBridge');
if (DEV_TOOLS && devTools.profiler) void import('./dev/profiler');

// Load the saved language's catalog before first render so the UI never flashes
// message keys, and re-activate whenever the picker changes it. `sync` fires
// immediately with the current value (the browser's preferred locale on first
// run) and again on every change. We await it so the first catalog is live
// before render.
await SETTINGS.language.sync((locale) => activateLocale(locale));

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<I18nProvider i18n={i18n}>
			<App />
		</I18nProvider>
	</StrictMode>,
);
