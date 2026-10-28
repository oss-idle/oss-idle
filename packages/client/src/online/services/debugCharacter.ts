import type {
	DebugCharacterBody,
	DebugSimBody,
} from '@oss-idle/shared/debug';
import type { DebugAnalysis } from '@oss-idle/shared/rulesets/mania/analysis';

import Entities from '../../entity/entities';
import { maniaOffsets } from '../../rulesets/mania/wire';
import { rpc } from '../client';
import { sendCharacterAction } from './characterAction';

/** Debug mode: put the live character's skills at these levels, and on a dev
 *  server its fatigue at these minutes - guests here, signed-in characters on
 *  the server, so its plays simulate them exactly. Returns true when it landed. */
export const setDebugCharacter = async (body: DebugCharacterBody): Promise<boolean> => {
	const character = Entities.character.get();
	if (character.id === 0) return false;
	if (character.isGuest()) {
		await character.setLevels(body.levels ?? {}, body.prestige ?? {});
		return true;
	}
	return sendCharacterAction(
		'Debug change',
		rpc.v1.me.debug.character.$post({ json: body }),
		() => false,
	);
};

/** The signed-in character's fatigue right now, in strained minutes. */
export const debugFatigueMinutes = async (): Promise<number | undefined> => {
	if (Entities.character.get().isGuest()) return undefined;
	const res = await rpc.v1.me.debug.character.$get();
	return res.ok ? (await res.json()).fatigueMinutes : undefined;
};

/** Debug mode on a dev server: the strain view of a 4K map with these knobs. */
export const debugStrains = async (body: DebugSimBody): Promise<DebugAnalysis | undefined> => {
	const res = await rpc.v1.me.debug.strains.$post({ json: body });
	return res.ok ? await res.json() as DebugAnalysis : undefined;
};

/** Debug mode on a dev server: the knobs' whole no-fail replay of a 4K map, and its gauges. */
export const debugReplay = async (body: DebugSimBody) => {
	const res = await rpc.v1.me.debug.play.$post({ json: body });
	if (!res.ok) return undefined;
	const { offsets, strains } = await res.json();
	return {
		offsets: maniaOffsets(offsets), strains,
	};
};
