import { z } from 'zod';

import { characterDTO } from '@oss-idle/shared/character';
import Log from '@oss-idle/shared/helpers/log';

import Account from '../account';
import {
	flushCharacter,
	flushCharacterStats,
} from './characters';

type Response = {
	ok: boolean,
	status: number,
	text: () => Promise<string>,
	json: () => Promise<unknown>,
};

const actionResult = z.union([
	z.object({ queued: z.literal(true) }),
	z.object({
		queued: z.literal(false).optional(), character: characterDTO,
	}),
]);

/**
 * Sends a spend (upgrade, prestige, rebirth) of the signed-in character and
 * takes the character the server hands back. One parked behind a running play
 * runs `queued` instead. Returns true when it landed.
 */
export const sendCharacterAction = async (
	what: string,
	request: Promise<Response>,
	queued: () => boolean | Promise<boolean>,
): Promise<boolean> => {
	const res = await request;
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		Log.errorPopup(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
		return false;
	}
	const body = actionResult.parse(await res.json());
	if (body.queued) return queued();

	const dto = body.character;
	flushCharacter(dto.id);
	flushCharacterStats(dto.id);
	await Account.character.set(dto);
	return true;
};
