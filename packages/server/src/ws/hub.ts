import type { WSContext } from 'hono/ws';

import {
	DEFAULT_CHANNEL,
	knowsLegacyChannel,
	LEGACY_DEFAULT_CHANNEL,
	type ServerMessage,
} from '@oss-idle/shared/community/wire';

import { redisKeyPrefix } from '../env';
import { redis } from '../redis';
import {
	characterOfSlot,
	type Slot,
} from '../slot';

/**
 * The WebSocket fan-out layer - feature-agnostic. Presence and chat are just
 * consumers: they hand it a {@link ServerMessage} and it reaches every connected
 * client, on any worker.
 *
 * Each worker keeps only its own sockets. Cross-worker delivery rides Redis
 * pub/sub: a publish on one worker is received by all (including the publisher),
 * and each forwards to the sockets it holds. A raw WebSocket stays on the worker
 * that accepted it for its whole life, so a slot's sockets are always local
 * to one worker - but we still address by slot (or character) through pub/sub so
 * any worker can reach any client without knowing where it lives.
 */

const CHANNEL = `${redisKeyPrefix}ws:broadcast`;

/**
 * What travels over the pub/sub channel: a message, optionally addressed to one
 * slot or to every slot of a character (otherwise delivered to everyone) - or a
 * rekey, which every worker applies to its own map.
 *
 * A rekey has to travel the same way a message does. The worker that ran the
 * rebirth is not the one holding the player's socket, so a local mutation there
 * fixes the binding only by coincidence.
 */
type Envelope =
	| {
		to?: Slot | number;
		msg: ServerMessage;
	}
	| {
		rekey: { from: Slot, to: Slot };
	};

const OPEN = 1;

/** The message as a client from before the rename to oss!idle reads it: the
 *  default channel under its old name. Undefined when it reads the same. */
const legacyMessage = (msg: ServerMessage): ServerMessage | undefined => {
	if (msg.type === 'chat' && msg.line.channel === DEFAULT_CHANNEL) {
		return {
			...msg, line: {
				...msg.line, channel: LEGACY_DEFAULT_CHANNEL,
			},
		};
	}
	if ((msg.type === 'chat:delete' || msg.type === 'chat:react') && msg.channel === DEFAULT_CHANNEL) {
		return {
			...msg, channel: LEGACY_DEFAULT_CHANNEL,
		};
	}
	return undefined;
};

class WsHub {

	private readonly conns = new Map<Slot, Set<WSContext>>();
	/** The slot each socket currently watches. A rekey moves a socket between
	 *  slots, and the connection that opened it still remembers the one it
	 *  connected with - so this, not the caller, is what says where it lives. */
	private readonly owner = new Map<WSContext, Slot>();
	private subscribed = false;
	/** Sockets of clients from before the rename to oss!idle. */
	private readonly legacy = new WeakSet<WSContext>();

	/** Start listening for published messages. Idempotent; called once per worker. */
	public init(): void {
		if (this.subscribed) return;
		this.subscribed = true;

		const sub = redis.duplicate();
		sub.on('error', err => console.error('WS pub/sub error:', err.message));
		void sub.subscribe(CHANNEL);
		sub.on('message', (_channel, payload) => {
			try {
				this.deliver(JSON.parse(payload) as Envelope);
			} catch (err) {
				console.error('WS deliver failed:', (err as Error).message);
			}
		});
	}

	/** Close every socket of this worker as restarting: its clients reconnect to another. */
	public closeAll(): void {
		for (const ws of this.owner.keys()) ws.close(1012, 'restarting');
	}

	public add(slot: Slot, ws: WSContext): void {
		let set = this.conns.get(slot);
		if (!set) this.conns.set(slot, set = new Set());
		set.add(ws);
		this.owner.set(ws, slot);
	}

	/** Move a slot's sockets onto another, everywhere: the account now watches
	 *  that one. */
	public rekey(from: Slot, to: Slot): void {
		if (from === to) return;
		void redis.publish(CHANNEL, JSON.stringify({
			rekey: {
				from, to,
			},
		} satisfies Envelope));
	}

	/** The slot a socket watches now, which is not always the one it connected as. */
	public ownerOf(ws: WSContext): Slot | undefined {
		return this.owner.get(ws);
	}

	public remove(ws: WSContext): void {
		const slot = this.owner.get(ws);
		this.owner.delete(ws);
		if (slot === undefined) return;
		const set = this.conns.get(slot);
		if (!set) return;
		set.delete(ws);
		if (set.size === 0) this.conns.delete(slot);
	}

	private applyRekey(from: Slot, to: Slot): void {
		const set = this.conns.get(from);
		if (!set) return;
		this.conns.delete(from);
		const target = this.conns.get(to);
		if (!target) this.conns.set(to, set);
		else for (const ws of set) target.add(ws);
		for (const ws of set) this.owner.set(ws, to);
	}

	/** What the client said it runs: one from before the rename is served the old channel name. */
	public noteVersion(ws: WSContext, version: string): void {
		if (knowsLegacyChannel(version)) this.legacy.add(ws);
	}

	/** Is this slot watched from *this* worker? */
	public isLocal(slot: Slot): boolean {
		return this.conns.has(slot);
	}

	/** Deliver to every connected client, everywhere. */
	public broadcast(msg: ServerMessage): void {
		void redis.publish(CHANNEL, JSON.stringify({ msg } satisfies Envelope));
	}

	/** Deliver to the clients watching one slot - or, given a character id, any of
	 *  its slots - wherever they are. */
	public sendTo(to: Slot | number, msg: ServerMessage): void {
		void redis.publish(CHANNEL, JSON.stringify({
			to, msg,
		} satisfies Envelope));
	}

	/** Send straight to one socket (no fan-out) - e.g. the initial snapshot. */
	public sendLocal(ws: WSContext, msg: ServerMessage): void {
		if (ws.readyState !== OPEN) return;
		ws.send(JSON.stringify(msg));
	}

	private deliver(envelope: Envelope): void {
		if ('rekey' in envelope) {
			this.applyRekey(envelope.rekey.from, envelope.rekey.to);
			return;
		}
		const { to, msg } = envelope;
		const data = JSON.stringify(msg);
		const legacy = legacyMessage(msg);
		const legacyData = legacy && JSON.stringify(legacy);
		const sets = to === undefined
			? this.conns.values()
			: typeof to === 'number'
				? [...this.conns].filter(([slot]) => characterOfSlot(slot) === to).map(([, set]) => set)
				: [this.conns.get(to)].filter(s => s !== undefined);
		for (const set of sets) {
			for (const ws of set) {
				if (ws.readyState === OPEN) ws.send(legacyData && this.legacy.has(ws) ? legacyData : data);
			}
		}
	}

}

export const hub = new WsHub();
