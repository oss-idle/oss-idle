import type { ZodError } from 'zod';

import {
	type ClientStatus,
	type PresenceEntry,
	presenceKey,
} from '@oss-idle/shared/community/presence';
import {
	type ChatLine,
	type ClientMessage,
	DEFAULT_CHANNEL,
	type ServerMessage,
	serverMessage,
} from '@oss-idle/shared/community/wire';
import { desktop } from '@oss-idle/shared/desktop';
import Synced from '@oss-idle/shared/helpers/synced';
import { VERSION } from '@oss-idle/shared/version';

import Account from './account';
import { BASE_URL } from './client';

/** Reconnect backoff, mirroring API.fetch: 1s, 2s, 4s … capped at 15s. */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

/** Mark ourselves AFK after this long without input. */
const AFK_MS = 60_000;

/** Keep at most this many chat lines in memory. */
const CHAT_LIMIT = 200;

const WS_OPEN = 1;
const WS_CONNECTING = 0;

type MessageType = ServerMessage['type'];
type MessageOf<T extends MessageType> = Extract<ServerMessage, { type: T }>;

/**
 * The single community WebSocket. A typed message bus shared with the server
 * (`serverMessage`/`clientMessage`): presence, the online count and chat travel
 * over it. Connects whenever a real (non-guest) account is live and auto-
 * reconnects with backoff; the open connection is itself our presence signal.
 *
 * Built to grow - new server features just add a message variant, not a socket.
 */
/** A message that fails validation is dropped, and a dropped message is
 *  indistinguishable from a server that never answered - whatever was waiting on
 *  it simply times out. Never let that happen quietly. */
const reportDiscarded = (raw: unknown, error: ZodError): void => {
	console.error('[socket] discarded an invalid message',
		(raw as { type?: string })?.type ?? '(no type)',
		error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
		raw);
};

export default class Socket {

	public static readonly presence = new Synced<PresenceEntry[]>([]);
	public static readonly online = new Synced(0);
	public static readonly chat = new Synced<ChatLine[]>([]);
	public static readonly connected = new Synced(false);
	/** The server's running version, pushed on every (re)connect. Defaults to our
	 *  own build so it never signals an update before the server has spoken. */
	public static readonly serverVersion = new Synced(VERSION);

	private static readonly listeners = new Map<string, Set<(msg: ServerMessage) => void>>();
	private static ws?: WebSocket;
	private static started = false;
	private static wanted = false;
	private static attempt = 0;
	private static reconnectTimer?: ReturnType<typeof setTimeout>;
	private static afkTimer?: ReturnType<typeof setTimeout>;
	private static status: ClientStatus = 'idle';

	public static start(): void {
		if (this.started) return;
		this.started = true;

		// Connect only once the session is resolved to a real account character. The
		// server binds the socket to the character and ruleset it connects as, so
		// watching another one reconnects.
		let watched: string | undefined;
		void Synced.all([Account.character, Account.resolved], ([character, resolved]) => {
			if (!resolved || !character) {
				watched = undefined;
				this.close();
				return;
			}
			const slot = `${character.id}:${character.ruleset}`;
			if (watched !== undefined && watched !== slot) this.drop();
			watched = slot;
			this.open();
		});

		this.watchActivity();
	}

	public static sendChat(text: string, channel: string = DEFAULT_CHANNEL, replyTo?: string): void {
		this.send({
			type: 'chat', channel, text, replyTo,
		});
	}

	/** Your reaction on a line, on or off (the server answers everyone with the line's reactions). */
	public static sendReact(channel: string, id: string, emoji: number, on: boolean): void {
		this.send({
			type: 'chat:react', channel, id, emoji, on,
		});
	}

	/** Send now if the socket is open. Returns whether it was sent. */
	public static send(msg: ClientMessage): boolean {
		if (this.ws?.readyState !== WS_OPEN) return false;
		this.ws.send(JSON.stringify(msg));
		return true;
	}

	/** Send now, or as soon as the socket (re)connects; dropped (false) after
	 *  `timeoutMs` without a connection. */
	public static async sendSoon(msg: ClientMessage, timeoutMs = 10_000): Promise<boolean> {
		try {
			await this.whenConnected(timeoutMs);
		} catch {
			return false;
		}
		return this.send(msg);
	}

	/** Subscribe to one server message type. Returns the unsubscribe. */
	public static on<T extends MessageType>(
		type: T,
		handler: (msg: MessageOf<T>) => void,
	): () => void {
		let set = this.listeners.get(type);
		if (!set) this.listeners.set(type, set = new Set());
		const h = handler as (msg: ServerMessage) => void;
		set.add(h);
		return () => set.delete(h);
	}

	/** Send `msg` and resolve with the first `type` message (matching `accept`,
	 *  when given). Waits for the socket to connect first; rejects on timeout. */
	public static async request<T extends MessageType>(
		msg: ClientMessage,
		type: T,
		timeoutMs = 10_000,
		accept?: (res: MessageOf<T>) => boolean,
	): Promise<MessageOf<T>> {
		await this.whenConnected(timeoutMs);
		return new Promise((resolve, reject) => {
			const off = this.on(type, res => {
				if (accept && !accept(res)) return;
				done();
				resolve(res);
			});
			const timer = setTimeout(() => {
				done();
				reject(new Error(`${msg.type} timed out`));
			}, timeoutMs);
			const done = () => {
				off();
				clearTimeout(timer);
			};
			if (!this.send(msg)) {
				done();
				reject(new Error('socket not connected'));
			}
		});
	}

	/** Resolves once the socket is open; rejects after `timeoutMs`. */
	private static whenConnected(timeoutMs: number): Promise<void> {
		if (this.connected.get()) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.connected.desync(onChange);
				reject(new Error('socket not connected'));
			}, timeoutMs);
			const onChange = (open: boolean) => {
				if (!open) return;
				clearTimeout(timer);
				this.connected.desync(onChange);
				resolve();
			};
			void this.connected.sync(onChange);
		});
	}

	private static open(): void {
		this.wanted = true;
		if (this.ws && (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)) return;

		const base = (BASE_URL || location.origin).replace(/^http/, 'ws');
		const token = desktop()?.getToken();
		const query = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
		if (token) query.set('token', token);
		const url = `${base}/v1/ws?${query}`;

		const ws = this.ws = new WebSocket(url);
		ws.onopen = () => {
			this.attempt = 0;
			this.connected.set(true);
			this.status = 'idle';
			this.send({
				type: 'version', version: VERSION, platform: desktop() ? 'desktop' : 'web',
			});
		};
		ws.onmessage = e => this.receive(e);
		ws.onclose = () => {
			this.connected.set(false);
			if (this.ws === ws) this.ws = undefined;
			if (this.wanted) this.scheduleReconnect();
		};
		ws.onerror = () => ws.close();
	}

	/** Close the socket to open another straight away. */
	private static drop(): void {
		const ws = this.ws;
		this.ws = undefined;
		if (!ws) return;
		ws.onclose = null;
		ws.close();
		this.connected.set(false);
	}

	private static close(): void {
		this.wanted = false;
		clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.ws = undefined;
		this.connected.set(false);
		void this.presence.set([]);
		void this.online.set(0);
	}

	private static scheduleReconnect(): void {
		const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempt, RECONNECT_MAX_MS);
		this.attempt++;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = setTimeout(() => {
			if (this.wanted) this.open();
		}, delay);
	}

	private static receive(e: MessageEvent): void {
		if (typeof e.data !== 'string') return;
		let raw: unknown;
		try {
			raw = JSON.parse(e.data);
		} catch {
			return;
		}
		const parsed = serverMessage.safeParse(raw);
		if (!parsed.success) return reportDiscarded(raw, parsed.error);
		const msg = parsed.data;

		// feature consumers (play, ...) subscribe by type; community is below
		this.listeners.get(msg.type)?.forEach(h => h(msg));
		this.receiveChat(msg);

		switch (msg.type) {
			case 'presence:init':
				void this.presence.set(msg.entries);
				break;
			case 'presence:add':
			case 'presence:update': {
				const rest = this.presence.get().filter(p => presenceKey(p) !== presenceKey(msg.entry));
				void this.presence.set([...rest, msg.entry]);
				break;
			}
			case 'presence:remove':
				void this.presence.set(this.presence.get().filter(p => presenceKey(p) !== presenceKey(msg)));
				break;
			case 'online':
				void this.online.set(msg.count);
				break;
			case 'version':
				void this.serverVersion.set(msg.version);
				break;
			case 'error':
				console.warn('Community:', msg.message);
				break;
		}
	}

	private static receiveChat(msg: ServerMessage): void {
		switch (msg.type) {
			case 'chat':
				void this.chat.set([...this.chat.get(), msg.line].slice(-CHAT_LIMIT));
				break;
			case 'chat:history': {
				const ids = new Set(msg.lines.map(l => l.id));
				void this.chat.set([...this.chat.get().filter(l => !ids.has(l.id)), ...msg.lines]
					.sort((a, b) => a.at - b.at)
					.slice(-CHAT_LIMIT));
				break;
			}
			case 'chat:react':
				void this.chat.set(this.chat.get().map(l =>
					l.channel === msg.channel && l.id === msg.id
						? {
							...l, reactions: msg.reactions,
						}
						: l));
				break;
			case 'chat:delete': {
				const ids = new Set(msg.ids);
				void this.chat.set(this.chat.get().map(l => {
					if (l.channel !== msg.channel) return l;
					if (ids.has(l.id)) return {
						...l, text: '<deleted>', reactions: undefined,
					};
					if (l.kind === 'player' && l.replyTo && ids.has(l.replyTo.id)) return {
						...l, replyTo: {
							...l.replyTo, text: '<deleted>',
						},
					};
					return l;
				}));
				break;
			}
		}
	}

	/** Report idle/afk from local input activity, rearming an inactivity timer. */
	private static watchActivity(): void {
		const wake = () => {
			this.setStatus('idle');
			clearTimeout(this.afkTimer);
			this.afkTimer = setTimeout(() => this.setStatus('afk'), AFK_MS);
		};
		for (const ev of ['pointermove', 'pointerdown', 'keydown'] as const) {
			window.addEventListener(ev, wake, { passive: true });
		}
		wake();
	}

	private static setStatus(status: ClientStatus): void {
		if (this.status === status || this.ws?.readyState !== WS_OPEN) return;
		this.status = status;
		this.send({
			type: 'status', status,
		});
	}

}
