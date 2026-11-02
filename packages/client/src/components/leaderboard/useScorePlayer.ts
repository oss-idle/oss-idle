import useAsync from '@oss-idle/shared/hooks/useAsync';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';

import Character from '../../db/schema/character';
import { getCharacter } from '../../online/services/characters';
import type { BoardPlayer } from '../../online/services/scores';
import { getUser } from '../../online/services/users';

type EntryCharacter = Character | Awaited<ReturnType<typeof getCharacter>> | BoardPlayer;

/** Server characters carry a resolved avatar (custom upload or osu! fallback);
 *  the local Guest has none, so fall back to the user avatar then the default.
 */
const entryAvatar = (
	character: EntryCharacter | undefined,
	userAvatarUrl: string | null | undefined,
) => character && 'avatarUrl' in character && character.avatarUrl
	? character.avatarUrl
	: userAvatarUrl || GUEST_AVATAR_URL;

/**
 * Who set a score: the leaderboard's player when it says, else the character
 * (local or online) and its user (none for a guest), fetched. `loaded` once the
 * character is known.
 */
export default function useScorePlayer(score: { characterId: number }, player?: BoardPlayer) {
	const fetched = useAsync(async () => {
		if (player || !score.characterId) return undefined;
		return Character.isLocalId(score.characterId)
			? await Character.get({ id: score.characterId })
			: await getCharacter(score.characterId);
	}, [score, player]);
	const character = player ?? fetched;

	const user = useAsync(async () => !player && character && 'userId' in character
		? getUser(character.userId)
		: undefined,
	[character]);

	return {
		character, user, avatarUrl: entryAvatar(character, user?.avatarUrl), loaded: !!character,
	};
}
