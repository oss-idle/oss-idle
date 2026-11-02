import {
	desktop,
	type DesktopUpdateStatus,
} from '@oss-idle/shared/desktop';
import Synced from '@oss-idle/shared/helpers/synced';

import { DB } from '../db/dao';

/**
 * In-game self-update state for the desktop app. We check the update feed on
 * launch, which drives the {@link DesktopUpdate} UI: the player
 * chooses to download, then restart into the new version.
 *
 * Inert in the browser - `desktop()` is null there, so nothing here runs.
 */
export const updateStatus = new Synced<DesktopUpdateStatus>({ state: 'idle' });

// set while a download re-checks the feed: the banner keeps its progress bar
let rechecking = false;

// Subscribe before the first check so a fast result can't broadcast before we're
// listening (the renderer drives the check, so it's always subscribed first).
desktop()?.update.onStatus(status => {
	if (rechecking && (status.state === 'checking' || status.state === 'available')) return;
	void updateStatus.set(status);
});

/** Ask the app whether a newer build is available (no-op in the browser).
 *  Returns the resulting status so callers can keep retrying until the feed
 *  actually offers the build (the installer lags the server version bump). */
export const checkForDesktopUpdate =
	async(): Promise<DesktopUpdateStatus | undefined> => {
		const app = desktop();
		if (!app) return;
		const status = await app.update.check();
		await updateStatus.set(status);
		return status;
	};

export const downloadDesktopUpdate = async () => {
	const app = desktop();
	if (!app) return;
	// Flip to the progress bar right away - the first real progress event lags, so
	// without this the click looks like it did nothing.
	void updateStatus.set({
		state: 'downloading', percent: 0,
	});
	// the feed may have moved on since it offered the update (a newer build published):
	// ask again, so the file downloaded and the checksum it is checked against are one build's
	rechecking = true;
	const offered = await app.update.check().finally(() => { rechecking = false; });
	if (offered.state !== 'available') {
		await updateStatus.set(offered);
		return;
	}
	// installing after a failed download only buries its error under electron-updater's
	// "No update filepath provided"
	const status = await app.update.download();
	if (status.state === 'error') return;
	await DB.saved();
	app.update.install();
};

// Check once on launch, independent of the server/client version poll - the app
// may simply be older than what's published, with no live server to compare to.
void checkForDesktopUpdate();