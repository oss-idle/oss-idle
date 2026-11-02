import './Settings.css';

import { Trans } from '@lingui/react/macro';

import { useCurrentCharacter } from '../../hooks/useCurrentCharacter';
import { PBE } from '../../pbe/pbe';
import SupporterSettings from '../../pbe/SupporterSettings';
import EmojiSettings from './EmojiSettings';
import ItchSettings, { type ItchClaim } from './ItchSettings';
import OAuthSettings from './OAuthSettings';
import TitleSettings from './TitleSettings';

/** osu!web's account settings: one section per row, its name on the left. */
export default function Settings({ itch }: { itch?: ItchClaim }) {
	const character = useCurrentCharacter();
	if (!character) {
		return <div className='page-contents'><Trans>Sign in to change your settings.</Trans></div>;
	}

	return <div className='settings'>
		{PBE && <div className='settings__section'>
			<div className='settings__name'>PBE</div>
			<div className='settings__body'>
				<SupporterSettings />
			</div>
		</div>}
		<div className='settings__section'>
			<div className='settings__name'><Trans>Title</Trans></div>
			<div className='settings__body'>
				<TitleSettings id={String(character.id)} />
			</div>
		</div>
		<div className='settings__section'>
			<div className='settings__name'><Trans>Emoji</Trans></div>
			<div className='settings__body'>
				<EmojiSettings />
			</div>
		</div>
		{!PBE && <div className='settings__section'>
			<div className='settings__name'>itch.io</div>
			<div className='settings__body'>
				<ItchSettings claim={itch} />
			</div>
		</div>}
		<div className='settings__section'>
			<div className='settings__name'><Trans>OAuth</Trans></div>
			<div className='settings__body'>
				<OAuthSettings />
			</div>
		</div>
	</div>;
}
