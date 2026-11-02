import type { WSContext } from 'hono/ws';

import type { ClientMessage } from '@oss-idle/shared/community/wire';

import {
	claimOffer,
	editQueue,
	holdQueue,
	localEnd,
	localStart,
	pauseQueue,
	setEntries,
	setPrefs,
	skipQueue,
	startQueue,
} from '../queue';
import type { Slot } from '../slot';
import { hub } from './hub';

/** A client sends a few of these at a time; a flood would rewrite the whole
 *  queue and fan it out to every device on each one. */
const LIMIT = 30;
const WINDOW_MS = 5000;
const LIMITED = new Set(['queue:set', 'queue:edit', 'queue:prefs']);
const recent = new WeakMap<WSContext, { count: number; since: number }>();
const flooding = (ws: WSContext): boolean => {
	const now = Date.now();
	const r = recent.get(ws);
	if (!r || now - r.since > WINDOW_MS) {
		recent.set(ws, {
			count: 1, since: now,
		});
		return false;
	}
	return ++r.count > LIMIT;
};

/** One socket's queue messages apply in the order sent: a local play's end and
 *  the next one's start must not cross. */
const lanes = new WeakMap<WSContext, Promise<unknown>>();

/** Handle one queue-scoped message. Returns false for anything else. */
export const handleQueue = async (
	msg: ClientMessage,
	slot: Slot,
	ws: WSContext,
): Promise<boolean> => {
	if (!msg.type.startsWith('queue:')) return false;
	if (LIMITED.has(msg.type) && flooding(ws)) return true;
	const run = (lanes.get(ws) ?? Promise.resolve())
		.catch(() => undefined)
		.then(() => apply(msg, slot, ws));
	lanes.set(ws, run);
	await run;
	return true;
};

const apply = async (
	msg: ClientMessage,
	slot: Slot,
	ws: WSContext,
): Promise<void> => {
	switch (msg.type) {
		case 'queue:set':
			await setEntries(slot, msg.source, msg.entries);
			return;
		case 'queue:edit':
			await editQueue(slot, msg.edit);
			return;
		case 'queue:pause':
			await pauseQueue(slot, msg.paused);
			return;
		case 'queue:start':
			await startQueue(slot);
			return;
		case 'queue:skip':
			await skipQueue(slot);
			return;
		case 'queue:prefs':
			await setPrefs(slot, msg.prefs);
			return;
		case 'queue:claim':
			hub.sendLocal(ws, {
				type: 'queue:claim', serial: msg.serial, ok: await claimOffer(slot, msg.serial),
			});
			return;
		case 'queue:localStart':
			await localStart(slot, msg.ms);
			return;
		case 'queue:hold':
			await holdQueue(slot, msg.ms);
			return;
		case 'queue:localEnd':
			await localEnd(slot, msg.skip ?? false);
			return;
	}
};
