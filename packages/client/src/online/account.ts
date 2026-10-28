import type { CharacterDTO } from '@oss-idle/shared/character';
import { desktop } from '@oss-idle/shared/desktop';
import Log, { POPUP_TYPE } from '@oss-idle/shared/helpers/log';
import sleep from '@oss-idle/shared/helpers/sleep';
import Synced from '@oss-idle/shared/helpers/synced';

import Character from '../db/schema/character';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import { isWebOpen } from '../globals';
import {
	loadRuleset,
	played,
	selectedRuleset,
} from '../rulesets/registry';
import Auth from './auth';
import { rpc } from './client';
import { projectPending } from './projectPending';
import { syncScores } from './scoreSync';

/** Give a single validation attempt this long before declaring us offline. */
const VALIDATE_TIMEOUT_MS = 15_000;
/** Spacing between background reconnect attempts once we've gone offline. */
const RECONNECT_INTERVAL_MS = 5_000;

/** localStorage key the login popup writes to signal the session changed. */
const AUTH_PING_KEY = 'oss-idle:auth';

/** Keep the local row in step with the account's character: scores are assigned
 *  by character id, so the row has to be there. It is a copy - the live
 *  character is already the server's - so a failure is logged and dropped. */
const mirrorLocally = async (character: Character): Promise<void> => {
	try {
		if (await Character.get(character.id)) await character.update();
		else await character.add();
	} catch (e) {
		console.warn('[account] could not mirror the character locally', e);
	}
};

/**
 * The signed-in account's server-side character, created during first-login
 * onboarding. The local sql.js character stays the live store (this is a
 * one-time snapshot import); `character === null` while logged in means the
 * account still needs onboarding.
 */
export default class Account {

	public static readonly character = new Synced<CharacterDTO | null>(null);
	public static readonly needsOnboarding = new Synced(false);
	/**
	 * False until the session has been validated against the API at least once
	 * (success or, after {@link VALIDATE_TIMEOUT_MS}, a timeout). While false
	 * we're "still validating" - the live character stays the placeholder and
	 * {@link ready} blocks play, so a freshly-booted client never scores as guest
	 * with a session still in flight.
	 */
	public static readonly resolved = new Synced(false);
	/**
	 * Whether we're currently connected to the API. Drops to false when a
	 * validation attempt times out (we then play offline as guest and reconnect
	 * in the background); back to true once the server answers again.
	 */
	public static readonly online = new Synced(true);
	/**
	 * No character to play with: signed out (or not onboarded yet) and no local
	 * character on this device. Play asks for local or online play first.
	 */
	public static readonly noCharacter = new Synced(false);

	private static initialized = false;
	public static init() {
		if (this.initialized) return;
		this.initialized = true;

		// Drive the live character off the *resolved* session. Until validation
		// answers we leave the placeholder in place - we must neither present a
		// guest nor a stale account before online auth has confirmed who we are.
		void Synced.all([
			Account.character, 
			Account.resolved,
		], async ([dto, resolved]) => {
			// the character's ruleset loads before anything shows the character in it
			const ruleset = played(dto?.ruleset ?? SETTINGS.guestRuleset.get());
			await loadRuleset(ruleset);
			void selectedRuleset.set(ruleset);
			if (dto) {
				const character = Character.fromDTO(dto);
				// what a running play has deferred is already bought - show it that
				// way, or a reload mid-play offers the same purchase again
				projectPending(character, dto.pendingActions);
				// The live character goes up first, and the local mirror follows on
				// its own. The mirror is only there so scores have a row to hang
				// off; a database that cannot be read or written is no reason for
				// the player's levels to stop moving everywhere they are shown.
				Entities.character.set(character);
				void Account.noCharacter.set(false);
				void mirrorLocally(character).then(syncScores);
				return;
			}
			// No account character: fall back to the local one only once we KNOW
			// we're signed out. While still validating, keep the loading character.
			if (!resolved) return;
			const local = await Character.localCurrent();
			Entities.character.set(local ?? Entities.placeholder());
			void Account.noCharacter.set(!local);
		});
	}

	/** The player chose local play: their first local character. */
	public static async playLocally(): Promise<void> {
		Entities.character.set(await Character.newCharacter());
		await Account.noCharacter.set(false);
	}

	/**
	 * Resolves once the session has been validated at least once. Play start
	 * awaits this so a play launched right after boot waits for the real
	 * character instead of being scored as guest mid-validation.
	 */
	public static ready(): Promise<void> {
		if (Account.resolved.get()) return Promise.resolve();
		return new Promise<void>(resolve => {
			const cb = (v: boolean) => {
				if (!v) return;
				Account.resolved.desync(cb);
				resolve();
			};
			void Account.resolved.sync(cb);
		});
	}

	/** Re-read the account's character. Used when a play ends: the server has
	 *  applied by then whatever the play deferred, so this is where a purchase
	 *  made mid-play stops being the client's optimistic copy and becomes fact. */
	public static async refresh(): Promise<void> {
		const res = await rpc.v1.me.character.$get();
		if (!res.ok) return;
		await Account.character.set(await res.json());
	}

	/** Onboard: create the account's character. Always fresh - local Guest
	 *  progress is no longer migrated online. */
	public static async complete(opts: { name: string }): Promise<void> {
		const res = await rpc.v1.me.character.$post({ json: { name: opts.name } });
		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			throw new Error(`onboarding failed (${res.status})${detail ? `: ${detail}` : ''}`);
		}

		const characterDTO = await res.json();
		await Account.needsOnboarding.set(false);
		await Account.character.set(characterDTO);
	}
}

/**
 * One bounded attempt to validate the session against the API. Resolves the user
 * and their character, committing both atomically so the UI never
 * shows a half-resolved state. Returns true if the server answered,
 * false if it couldn't be reached within {@link VALIDATE_TIMEOUT_MS}.
 *
 * The timeout is what bounds us: API.fetch retries transient failures (network
 * errors, 5xx) indefinitely, but it surfaces an intentional abort - so a downed
 * or restarting server trips the timeout here instead of hanging forever.
 */
async function probeSession(): Promise<boolean> {
	try {
		const signal = AbortSignal.timeout(VALIDATE_TIMEOUT_MS);
		const meRes = await rpc.v1.auth.me.$get(undefined, { init: { signal } });
		const user = meRes.ok ? await meRes.json() : null;

		let character: CharacterDTO | null = null;
		if (user) {
			const charRes = await rpc.v1.me.character.$get(undefined, { init: { signal } });
			character = charRes.ok ? await charRes.json() : null;
		}

		// Commit only once both calls have answered, so the avatar (user) and the
		// live character can never momentarily disagree.
		Auth.user.set(user);
		Account.character.set(character);
		Account.needsOnboarding.set(user !== null && character === null);
		return true;
	} catch (e) {
		// Timed out / aborted → the server is unreachable right now.
		Log.errorPopup(`Failed to synchronize character ${e}`);
		console.error(e);
		return false;
	}
}

/** Mark us online, announcing recovery only on the offline→online edge. */
async function goOnline(): Promise<void> {
	if (!Account.online.get()) Log.popup('Back online.', POPUP_TYPE.good);
	await Account.online.set(true);
}

/** Mark us offline, announcing it only on the online→offline edge. The message
 *  differs depending on whether we had a session to begin with: a fresh boot
 *  falls back to guest, an established session is just temporarily unreachable
 *  (we keep it rather than dropping to guest over a blip). */
async function goOffline(): Promise<void> {
	if (Account.online.get()) {
		Log.errorPopup(Auth.user.get()
			? 'Connection lost - reconnecting…'
			: 'Disconnected from server - playing offline as Guest.');
	}
	await Account.online.set(false);
}

/**
 * Validate the session, bounded so a down/restarting server can't hang the
 * client. On success we're online with the real character on a timeout we settle
 * as guest and keep retrying in the background until the server returns.
 */
async function syncSession(fromLogin = false): Promise<void> {
	const ok = await probeSession();
	await Account.resolved.set(true);

	if (ok) {
		await goOnline();
		// On a fresh login, drop the in-game browser to return the player to the game.
		if (fromLogin && Auth.user.get()) isWebOpen.set(false);
		return;
	}

	await goOffline();
	void reconnectLoop();
}

let reconnecting = false;

/**
 * After a disconnect, keep probing in the background; the moment the server
 * answers again, restore the real session (which swaps the guest character back
 * to the account in the UI) and announce it.
 */
async function reconnectLoop(): Promise<void> {
	if (reconnecting) return; // a loop is already running
	reconnecting = true;
	try {
		while (!Account.online.get()) {
			await sleep(RECONNECT_INTERVAL_MS);
			if (await probeSession()) await goOnline();
		}
	} finally {
		reconnecting = false;
	}
}

/**
 * Tie the in-game browser (web) session to the client's. The web platform runs
 * in a same-origin iframe and authenticates off the same HttpOnly cookie, so the
 * source of truth is shared - but its cached view can drift. Whenever our
 * resolved user identity changes we ping localStorage, which the web iframe
 * listens for to re-read the session. Guarded on the user id so a
 * re-validation landing on the same account doesn't loop the ping back and forth.
 */
let lastBroadcastUserId: number | null = Auth.user.get()?.id ?? null;
void Auth.user.sync(user => {
	const id = user?.id ?? null;
	if (id === lastBroadcastUserId) return;
	lastBroadcastUserId = id;
	try { localStorage.setItem(AUTH_PING_KEY, String(Date.now())); }
	catch { /* ignore */ }
});

// Resolve on boot.
void syncSession();

// The login/logout flows (and the broadcast above, from another tab) write
// AUTH_PING_KEY; the same-origin `storage` event re-resolves our session so the
// client and the web platform never disagree on who's signed in.
window.addEventListener('storage', e => {
	if (e.key === AUTH_PING_KEY) void syncSession(true);
});

const RECHECK_MS = 60_000;
let lastRecheck = Date.now();

/** Back to the game: picks up what changed on the account meanwhile (a supporter tag bought
 *  in the browser, or run out). A failed check changes nothing. */
const recheckAccount = async (): Promise<void> => {
	if (!Auth.user.get() || Date.now() - lastRecheck < RECHECK_MS) return;
	lastRecheck = Date.now();
	const res = await rpc.v1.auth.me.$get().catch(() => undefined);
	if (!res?.ok) return;
	const user = await res.json();
	if (JSON.stringify(user) !== JSON.stringify(Auth.user.get())) Auth.user.set(user);
};
window.addEventListener('focus', () => void recheckAccount());

// Desktop holds the session as a Bearer token (no cookie / no storage ping), so
// re-resolve whenever the app reports the token changed (sign-in or sign-out).
desktop()?.onAuthChanged(() => void syncSession(true));

Account.init();