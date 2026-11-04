import './FriendButton.css';

import { faUserPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import BigNum from '@oss-idle/shared/display/BigNum';
import useAsync from '@oss-idle/shared/hooks/useAsync';

import {
	addFriend,
	getRelation,
	removeFriend,
} from '../../api/social';

type Relation = Awaited<ReturnType<typeof getRelation>>;

/** osu!web's add-friend pill: the follower count, green once you added them,
 *  pink when it's mutual. Inert on your own profile and when signed out. */
export default function FriendButton({ userId, interactive }: {
	userId: number;
	interactive: boolean;
}) {
	const { t } = useLingui();
	const loaded = useAsync(() => getRelation(userId), [userId]);
	const [changed, setChanged] = useState<Relation>();
	const [busy, setBusy] = useState(false);
	const relation = changed ?? loaded;
	if (!relation) return null;

	const friend = 'friend' in relation && relation.friend;
	const mutual = 'mutual' in relation && relation.mutual;
	const state = mutual ? 'mutual' : friend ? 'friend' : 'none';

	const toggle = async () => {
		setBusy(true);
		try {
			if (friend) await removeFriend(userId);
			else await addFriend(userId);
			setChanged(await getRelation(userId));
		} finally {
			setBusy(false);
		}
	};

	return (
		<button
			type="button"
			className="friend-button"
			data-state={state}
			title={interactive ? (friend ? t`remove friend` : t`add friend`) : undefined}
			disabled={!interactive || busy}
			onClick={() => void toggle()}
		>
			<FontAwesomeIcon icon={faUserPlus} />
			<BigNum value={relation.followers} theme='aurora' />
		</button>
	);
}
