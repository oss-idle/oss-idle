import { t } from '@lingui/core/macro';

import compareVersions from '@oss-idle/shared/helpers/compareVersions';
import Log, { POPUP_TYPE } from '@oss-idle/shared/helpers/log';

import { Addon } from '../db/schema/addon';
import { SkinDAO } from '../db/schema/skin';
import { openPage } from '../globals';
import { getAddon } from './addons';
import { getSkin } from './skins';

type Item = { id: number, version: string };

/** Whether any installed item has a newer published version (best effort, as
 *  `useHasUpdate`: a 404 or no network is no update). */
const anyBehind = async (installed: Item[], get: (id: number) => Promise<{ version: string }>) =>
	(await Promise.all(installed.map(a => get(a.id)
		.then(d => compareVersions(d.version, a.version) > 0)
		.catch(() => false)))).some(Boolean);

/** At launch, pops once per kind when installed skins or add-ons have updates;
 *  clicking it opens that kind's manage page, where the Update buttons are. */
const check = async () => {
	const skins = (await SkinDAO.getAll()).filter(s => !s.local);
	if (await anyBehind(skins, getSkin)) Log.popup(
		t`Some of your skins have updates`, POPUP_TYPE.neutral, false,
		() => openPage.set({
			page: 'skins', view: 'manage', 
		}),
	);
	if (await anyBehind((await Addon.getAll()).filter(a => !a.local), getAddon)) Log.popup(
		t`Some of your add-ons have updates`, POPUP_TYPE.neutral, false,
		() => openPage.set({
			page: 'addons', view: 'manage', 
		}),
	);
};

// once the menu has settled, as the changelog popup (the popup overlay mounts after the scene)
setTimeout(() => void check(), 1200);
