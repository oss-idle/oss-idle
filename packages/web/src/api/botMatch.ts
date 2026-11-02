import type { InferResponseType } from 'hono/client';

import {
	rpc,
	unwrap,
} from './client';

export type MyBotMatch = InferResponseType<typeof rpc.v1['bot-match']['me']['$get'], 200>;

export const getMyBotMatch = () => unwrap(rpc.v1['bot-match'].me.$get());

/** Queue the player's match. */
export const runBotMatch = () => unwrap(rpc.v1['bot-match'].me.$post());

/** Anyone's match. */
export const getBotMatch = (userId: string) => unwrap(
	rpc.v1['bot-match'][':id'].$get({ param: { id: userId } }),
);
