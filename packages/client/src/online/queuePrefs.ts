import Synced from '@oss-idle/shared/helpers/synced';
import type { QueuePrefs } from '@oss-idle/shared/queue';
import {
	RULESET_IDS,
	type RulesetId,
} from '@oss-idle/shared/rulesets/ids';

import {
	RulesetSetting,
	SETTINGS,
	wasStored,
} from '../db/settings';
import Entities from '../entity/entities';
import {
	autoSkip,
	PBE,
} from '../pbe/pbe';
import Socket from './socket';

/** Set once this device's own preferences, from before they moved to the
 *  server, were sent up. */
const UPLOADED = 'queuePrefsUploaded';

type Key = keyof QueuePrefs;

/** The defaults from before the move: a value still at one was never picked. */
const OLD_DEFAULTS: Omit<QueuePrefs, 'keepPlaying' | 'playOnce' | 'autoSkip'> = {
	mode: 'PLAYLIST', delay: 30, rate: 1, mods: [],
};

/** The account keeps its character playing once the game is closed. */
export const keepPlaying = new Synced(true);

const VALUE: { [K in Key]: Synced<QueuePrefs[K]> } = {
	mode: SETTINGS.autopilotMode,
	delay: SETTINGS.autopilotDelay,
	rate: SETTINGS.rate,
	mods: SETTINGS.mods,
	keepPlaying,
	playOnce: SETTINGS.queuePlayOnce,
	autoSkip: autoSkip as Synced<boolean | undefined>,
};

const KEYS = (Object.keys(VALUE) as Key[]).filter(k => PBE || k !== 'autoSkip');

/** A value as `ruleset` keeps it: the account's and the character's are the same in all. */
const valueIn = (k: Key, ruleset: RulesetId): Synced<unknown> => {
	const value = VALUE[k] as Synced<unknown>;
	return value instanceof RulesetSetting ? value.of(ruleset) : value;
};

/** What the server holds for the character in the slot's ruleset. */
let server: QueuePrefs | undefined;
let serverRuleset: RulesetId = 'mania4k';

/** One value: in a ruleset, or everywhere. */
type Id = `${Key}` | `${Key}:${RulesetId}`;
const idOf = (k: Key, ruleset: RulesetId): Id =>
	VALUE[k] instanceof RulesetSetting ? `${k}:${ruleset}` : k;

/** The value each one last had here, to tell a change made on this device from
 *  one applied from the server. */
const shown = new Map<Id, unknown>();

/** When each value was last changed here. A push of an older value - an echo
 *  in flight, or the first push after loading - must not undo it. */
const changedAt = new Map<Id, number>();
const ECHO_MS = 2000;

// mods are a list
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const recent = (id: Id) => Date.now() - (changedAt.get(id) ?? 0) < ECHO_MS;

/** Send what differs here from the server. */
const upload = (): void => {
	if (!server || Entities.character.get()?.isGuest()) return;
	const value = (k: Key) => valueIn(k, serverRuleset).get();
	const changed = Object.fromEntries(KEYS
		.filter(k => !same(value(k), server![k]))
		.map(k => [k, value(k)])) as Partial<QueuePrefs>;
	if (!Object.keys(changed).length) return;
	server = {
		...server, ...changed,
	};
	void Socket.sendSoon({
		type: 'queue:prefs', prefs: changed,
	});
};

/** Each ruleset's own value is watched, not the picked one: picking another
 *  ruleset changes what shows, not what anyone chose. */
for (const k of KEYS) {
	const rulesets = VALUE[k] instanceof RulesetSetting ? RULESET_IDS : ['mania4k' as const];
	for (const ruleset of rulesets) {
		const id = idOf(k, ruleset);
		shown.set(id, valueIn(k, ruleset).get());
		void valueIn(k, ruleset).sync(value => {
			if (same(value, shown.get(id))) return;
			shown.set(id, value);
			changedAt.set(id, Date.now());
			if (id === idOf(k, serverRuleset)) upload();
		});
	}
}

/** Forget the server's values: another identity's arrive with its own push. */
export const resetPrefs = (): void => {
	server = undefined;
	changedAt.clear();
};

/** A value this device picked before the preferences moved to the server: sent
 *  up the first time, instead of being replaced. */
const pickedHere = (k: Key, ruleset: RulesetId): boolean => k in OLD_DEFAULTS
	&& wasStored((VALUE[k] as typeof SETTINGS.rate).key)
	&& !same(valueIn(k, ruleset).get(), OLD_DEFAULTS[k as keyof typeof OLD_DEFAULTS]);

/** The character's queue preferences in `ruleset`, and the account's keep
 *  playing, as the server pushed them. A value changed here moments ago stays,
 *  and goes up. */
export const receivePrefs = (pushed: QueuePrefs, ruleset: RulesetId): void => {
	server = pushed;
	serverRuleset = ruleset;
	const first = !localStorage.getItem(UPLOADED);
	if (first) localStorage.setItem(UPLOADED, '1');
	for (const k of KEYS) {
		const id = idOf(k, ruleset);
		if (recent(id) || (first && pickedHere(k, ruleset))) continue;
		const value = valueIn(k, ruleset);
		if (same(value.get(), pushed[k])) continue;
		shown.set(id, pushed[k]);
		void value.set(pushed[k]);
	}
	upload();
};
