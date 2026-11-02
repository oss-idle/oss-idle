import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import HoverCard from '@oss-idle/shared/display/HoverCard';

import { favouriteMapset } from '../../api/maps';

/** osu!web's favourite button: an outlined heart, filled once favourited. */
export default function FavouriteButton({ setId, favourited, onChange }: {
	setId: number,
	favourited: boolean,
	onChange: (favourited: boolean, count: number) => void,
}) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const toggle = async () => {
		setBusy(true);
		try {
			const { count } = await favouriteMapset(setId, !favourited);
			onChange(!favourited, count);
		} finally {
			setBusy(false);
		}
	};
	const label = favourited ? t`Unfavourite this beatmapset` : t`Favourite this beatmapset`;
	return <HoverCard card={label}>
		<button
			type='button'
			className={`mapset__button mapset__button--square${favourited ? ' is-favourited' : ''}`}
			aria-label={label}
			disabled={busy}
			onClick={() => void toggle()}
		>
			<FontAwesomeIcon icon={faHeart} />
		</button>
	</HoverCard>;
}
