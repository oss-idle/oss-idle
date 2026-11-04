import Synced from '@oss-idle/shared/helpers/synced';
import type { QueuePrefs } from '@oss-idle/shared/queue';

import {
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

/** What the server holds for the character. */
let server: QueuePrefs | undefined;

/** The value each one last had here, to tell a change made on this device from
 *  one applied from the server. */
const shown = new Map<Key, unknown>();

/** When each value was last changed here. A push of an older value - an echo
 *  in flight, or the first push after loading - must not undo it. */
const changedAt = new Map<Key, number>();
const ECHO_MS = 2000;

// mods are a list
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const recent = (k: Key) => Date.now() - (changedAt.get(k) ?? 0) < ECHO_MS;

/** Send what differs here from the server. */
const upload = (): void => {
	if (!server || Entities.character.get()?.isGuest()) return;
	const changed = Object.fromEntries(KEYS
		.filter(k => !same(VALUE[k].get(), server![k]))
		.map(k => [k, VALUE[k].get()])) as Partial<QueuePrefs>;
	if (!Object.keys(changed).length) return;
	server = {
		...server, ...changed,
	};
	void Socket.sendSoon({
		type: 'queue:prefs', prefs: changed,
	});
};

for (const k of KEYS) {
	shown.set(k, VALUE[k].get());
	void (VALUE[k] as Synced<unknown>).sync(value => {
		if (same(value, shown.get(k))) return;
		shown.set(k, value);
		changedAt.set(k, Date.now());
		upload();
	});
}

/** Forget the server's values: another identity's arrive with its own push. */
export const resetPrefs = (): void => {
	server = undefined;
	changedAt.clear();
};

/** A value this device picked before the preferences moved to the server: sent
 *  up the first time, instead of being replaced. */
const pickedHere = (k: Key): boolean => k in OLD_DEFAULTS
	&& wasStored((VALUE[k] as typeof SETTINGS.rate).key)
	&& !same(VALUE[k].get(), OLD_DEFAULTS[k as keyof typeof OLD_DEFAULTS]);

/** The character's autopilot mode, delay, rate and mods, and the account's
 *  keep playing, as the server pushed them. A value changed here moments ago
 *  stays, and goes up. */
export const receivePrefs = (pushed: QueuePrefs): void => {
	server = pushed;
	const first = !localStorage.getItem(UPLOADED);
	if (first) localStorage.setItem(UPLOADED, '1');
	for (const k of KEYS) {
		if (recent(k) || (first && pickedHere(k))) continue;
		if (same(VALUE[k].get(), pushed[k])) continue;
		shown.set(k, pushed[k]);
		void (VALUE[k] as Synced<unknown>).set(pushed[k]);
	}
	upload();
};
