import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import type { ChatLine } from '@oss-idle/shared/community/wire';
import {
	mapped,
	type ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import Synced from '@oss-idle/shared/helpers/synced';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import { Setting } from '../../db/settings';
import { isCommunityOpen } from '../../globals';
import { selectedRuleset } from '../../rulesets/registry';
import {
	TAB,
	type Tab,
} from './tabs';

export const showUsers = new Synced(false);
export const showChat = new Synced(false);
export const showTicker = new Setting('community.showTicker', true);
export const autoHide = new Setting('community.autoHide', false);

/** How the roster is narrowed. `friends` = the accounts you added. */
export const FILTER = mapped(['all', 'friends', 'country']);
export type Filter = ValueIn<typeof FILTER>;

/** Transient view state, shared so the header and body stay in sync. */
export const activeTab = new Synced<Tab | undefined>(TAB.name);
export const activeFilter = new Synced<Filter>(FILTER.all);
export const searchQuery = new Synced('');
/** The one ruleset the roster lists, like osu!'s mode filter: the one you play, until
 *  you pick another. */
export const rosterRuleset = new Synced<RulesetId>(selectedRuleset.get());
void selectedRuleset.sync(id => void rosterRuleset.set(id));
export type PlayerChatLine = Extract<ChatLine, { kind: 'player' }>;
/** A player whose card or chat name was clicked: their interaction menu is
 *  open. `line` is the chat message clicked, which the menu can report. */
export type MenuTarget = Pick<PresenceEntry, 'characterId' | 'userId' | 'name'> & {
	line?: PlayerChatLine;
};
export const menuFor = new Synced<MenuTarget | undefined>(undefined);
/** A web address clicked in chat: the menu asking to open it is up. */
export const linkFor = new Synced<string | undefined>(undefined);
void isCommunityOpen.sync(open => {
	if (open) return;
	void menuFor.set(undefined);
	void linkFor.set(undefined);
});

