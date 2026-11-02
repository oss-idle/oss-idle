import { randomUUID } from 'node:crypto';

import {
	createNodeWebSocket,
	type NodeWebSocket,
} from '@hono/node-ws';
import type { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { WSContext } from 'hono/ws';
import type { ZodError } from 'zod';

import {
	clientMessage,
	DEFAULT_CHANNEL,
} from '@oss-idle/shared/community/wire';
import { VERSION } from '@oss-idle/shared/version';

import { verifySession } from '../auth/jwt';
import { SESSION_COOKIE } from '../auth/middleware';
import { characterDTOOf } from '../character/dto';
import {
	type CharacterRow,
	currentCharacterOf,
	getCharacterById,
} from '../db/schema/character';
import type { UserRow } from '../db/schema/user';
import {
	clientUrl,
	isProd,
} from '../env';
import {
	clientIp,
	geoLookup,
	type GeoResult,
	validTimezone,
} from '../geo';
import { pushMedals } from '../medals';
import { count } from '../metrics';
import {
	isPlaying,
	livePlayPresence,
	playState,
} from '../play';
import {
	comeBack,
	queueState,
	socketClosed,
} from '../queue';
import { redis } from '../redis';
import { selectedRuleset } from '../rulesets/registry';
import {
	characterOfSlot,
	parseSlot,
	type Slot,
	watchedSlot,
} from '../slot';
import { touchActive } from '../social';
import {
	chatHistory,
	handleChat,
	handleReact,
	nameColor,
} from './chat';
import { hub } from './hub';
import {
	handleMultiplayer,
	MatchFeed,
	ownMatch,
} from './multiplayer';
import {
	handlePlay,
	PlayFeed,
} from './play';
import { handlePm } from './pm';
import {
	isListed,
	join,
	NEWEST_TTL_S,
	newestKey,
	presenceSnapshot,
	recordAdoption,
	touch,
	update,
} from './presence';
import { handleQueue } from './queue';

/** How often a live connection refreshes its presence last-seen (well under the
 *  sweep TTL) so a clean session is never pruned. */
const TOUCH_MS = 30 * 1000;

/** The newest socket's id, forgotten when it is this one. */
const FORGET_NEWEST = `local v = redis.call('get', KEYS[1])
if v == ARGV[1] then redis.call('del', KEYS[1]) end
return v`;

/** Lines of the default channel a client gets on connect. */
const CHAT_HISTORY = 100;

/** The session JWT for a WS upgrade: Bearer / cookie like REST, plus a `?token=`
 *  fallback because a browser can't set headers on a WebSocket and the desktop
 *  app has no cookie. */
const wsToken = (c: Context): string | undefined => {
	const auth = c.req.header('Authorization');
	if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
	// the cookie also rides along from sibling sites on the same domain
	const ownOrigin = !isProd || c.req.header('Origin') === clientUrl;
	const cookie = ownOrigin ? getCookie(c, SESSION_COOKIE) : undefined;
	return cookie ?? c.req.query('token');
};

/** Put the slot a socket watches on the roster. join() resets status to idle, so a
 *  live play is restored as `playing`. */
const enter = async (
	slot: Slot, character: CharacterRow, user: UserRow, geo: GeoResult,
): Promise<void> => {
	await join({
		slot, character, user, geo,
	});
	const live = await livePlayPresence(slot);
	if (live) await update(slot, live);
};

/** Refresh a connection's last-seen. The roster entry is per slot, so another of
 *  its sockets closing - elsewhere in the cluster too - takes it away from this
 *  one; put it back. */
const heartbeat = async (slot: Slot, userId: number, geo: GeoResult): Promise<void> => {
	void touchActive(userId);
	void redis.expire(newestKey(userId), NEWEST_TTL_S);
	void comeBack(slot);
	if (await isListed(slot)) {
		await touch(slot);
		return;
	}
	const now = await currentCharacterOf(userId);
	if (!now || now.user.restrictedAt) return;
	await enter(watchedSlot(now.character), now.character, now.user, geo);
};

/**
 * Mount the community WebSocket at `/v1/ws`. Returns `injectWebSocket`, which the
 * server entrypoint attaches to the Node http server. Not part of `AppType` - the
 * socket is a typed message bus (shared `clientMessage`/`serverMessage`), not RPC.
 */
/** A message that fails validation is dropped, and a dropped message is
 *  indistinguishable from one the client never sent: whatever it asked for
 *  simply never happens, with nothing anywhere to say why. */
const reportDiscarded = (userId: number, raw: unknown, error: ZodError): void => {
	console.error('[ws] discarded an invalid message from', userId,
		(raw as { type?: string })?.type ?? '(no type)',
		error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
};

export const registerWs = (app: Hono): Pick<NodeWebSocket, 'injectWebSocket'> => {
	const {
		upgradeWebSocket, injectWebSocket, wss,
	} = createNodeWebSocket({ app });
	// ws allows 100 MiB frames by default; a full play queue is the biggest of ours
	wss.options.maxPayload = 256 * 1024;

	app.get('/v1/ws', upgradeWebSocket(async c => {
		const token = wsToken(c);
		const session = token ? await verifySession(token).catch(() => undefined) : undefined;
		const resolved = session ? await currentCharacterOf(session.uid) : undefined;

		if (!session || !resolved) {
			return { onOpen: (_e, ws) => ws.close(1008, 'unauthorized') };
		}

		const { character, user } = resolved;
		const userId = session.uid;
		// the city DB has no timezones, so the client's own wins
		const geo = await geoLookup(clientIp(c), user.country);
		geo.tz = validTimezone(c.req.query('tz')) ?? geo.tz;
		let beat: ReturnType<typeof setInterval> | undefined;
		let feed: PlayFeed | undefined;
		let scores: MatchFeed | undefined;
		const conn = randomUUID();

		// The socket watches the slot it connected as; a switch of character or
		// ruleset reconnects. The hub is what knows where it belongs.
		const slot = watchedSlot(character);
		const bound = (ws: WSContext) => hub.ownerOf(ws) ?? slot;
		// Anything about the character itself - its name - is read when it is
		// needed. The row captured at connect stops being true the moment the
		// account rebirths or renames, and holding it against any one of those
		// signals only covers that one.
		const currentRow = async () =>
			(await currentCharacterOf(userId))?.character ?? character;

		return {
			onOpen: async (_e, ws) => {
				count('activity', 'sockets');
				hub.add(slot, ws);
				await redis.set(newestKey(userId), conn, 'EX', NEWEST_TTL_S);
				await comeBack(slot);
				feed = new PlayFeed(() => bound(ws), ws);
				scores = new MatchFeed(() => characterOfSlot(bound(ws)), ws);
				// join() broadcasts our entry; the snapshot below already includes it.
				await enter(slot, character, user, geo);
				hub.sendLocal(ws, {
					type: 'presence:init', entries: await presenceSnapshot(),
				});
				hub.sendLocal(ws, {
					type: 'version', version: VERSION,
				});
				// the character as the server has it, so a client that was away -
				// or one whose copy drifted - starts from the row, not from what it
				// last managed to read
				hub.sendLocal(ws, {
					type: 'character',
					character: await characterDTOOf(character, user),
				});
				hub.sendLocal(ws, {
					type: 'chat:history', lines: await chatHistory(DEFAULT_CHANNEL, CHAT_HISTORY),
				});
				// what (if anything) the character is playing, for resume/spectate
				hub.sendLocal(ws, {
					type: 'play:state', state: await playState(slot),
				});
				const queue = await queueState(slot);
				if (queue) {
					hub.sendLocal(ws, {
						type: 'queue:state', state: queue,
					});
				}
				const match = await ownMatch(character.id);
				if (match) {
					hub.sendLocal(ws, {
						type: 'mp:joined', match,
					});
				}
				void touchActive(userId);
				beat = setInterval(() => void heartbeat(bound(ws), userId, geo), TOUCH_MS);
			},
			onMessage: async (evt, ws) => {
				if (typeof evt.data !== 'string') return;
				let raw: unknown;
				try {
					raw = JSON.parse(evt.data);
				} catch {
					return;
				}
				const parsed = clientMessage.safeParse(raw);
				if (!parsed.success) return reportDiscarded(userId, raw, parsed.error);
				const msg = parsed.data;

				const features: [string, () => Promise<boolean>][] = [
					['play', async () => !!feed && handlePlay(msg, {
						character,
						slot: bound(ws),
						ws,
						feed,
						// the row *is* the simulation's input: levels, upgrades and
						// overdrive as they are now, not as they were at connect
						freshCharacter: () => getCharacterById(characterOfSlot(bound(ws))),
					})],
					['queue', () => handleQueue(msg, bound(ws), ws)],
					['mp', () => handleMultiplayer(msg, characterOfSlot(bound(ws)), ws, scores)],
					['react', async () => {
						if (msg.type !== 'chat:react') return false;
						await handleReact((await currentRow()).id, user.id, msg.channel, msg.id, msg.emoji, msg.on);
						return true;
					}],
				];
				for (const [tag, handle] of features) {
					try {
						if (await handle()) return;
					} catch (e) {
						console.error(`[${tag}]`, msg.type, 'failed for', slot, e);
						return;
					}
				}

				if (msg.type === 'chat') {
					const now = await currentRow();
					await handleChat({
						characterId: now.id,
						name: now.name,
						color: await nameColor(user.id),
					}, user.id, msg.channel, msg.text, { replyTo: msg.replyTo });
				} else if (msg.type === 'pm') {
					const now = await currentRow();
					await handlePm({
						userId: user.id,
						characterId: now.id,
						name: now.name,
						color: await nameColor(user.id),
					}, msg.to, msg.text);
				} else if (msg.type === 'status') {
					// The client reports idle/afk from input activity; ignore it while
					// a play is live so it can't clobber the server-set `playing`.
					const id = bound(ws);
					if (!(await isPlaying(id))) await update(id, { status: msg.status });
				} else if (msg.type === 'medals:check') {
					const { characterId, ruleset } = parseSlot(bound(ws));
					await pushMedals(selectedRuleset({ ruleset }), characterId);
				} else if (msg.type === 'version') {
					hub.noteVersion(ws, msg.version);
					await recordAdoption(characterOfSlot(bound(ws)), msg.version, msg.platform);
				}
			},
			onClose: (_e, ws) => {
				if (beat) clearInterval(beat);
				feed?.stop();
				scores?.stop();
				// read before the remove, which is what forgets where it belonged
				const id = bound(ws);
				hub.remove(ws);
				void (redis.eval(FORGET_NEWEST, 1, newestKey(userId), conn) as Promise<string | undefined>)
					// a newer socket, here or on another worker, keeps it online
					.then(newest => hub.isLocal(id) || (newest && newest !== conn) ? undefined : socketClosed(id))
					.catch(e => console.error('[ws] close failed for', id, e));
			},
		};
	}));

	return { injectWebSocket };
};
