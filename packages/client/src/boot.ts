import { moveHost } from '@oss-idle/shared/hostMove';

import {
	devTools,
	STAGING,
} from './dev/devTools';

// best effort: maps and skins kept in the browser stay when it runs short of space
void navigator.storage?.persist().catch(() => false);
// before the game's modules load: on the old host they would open the save it hands over
await moveHost();
if (STAGING) {
	await (await import('./dev/devMenu')).chooseDevTools();
	const { trace } = await import('./dev/trace');
	if (devTools.traceLaunch) trace();
}
await import('./main');
