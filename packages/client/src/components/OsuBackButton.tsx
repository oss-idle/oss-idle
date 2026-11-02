import './OsuBackButton.css';

import { Trans } from '@lingui/react/macro';

import { uiSound } from '../audio/uiSounds';

/** osu!'s back button, bottom left: it stretches open under the cursor. */
export default function OsuBackButton({ onBack }: { onBack: () => void }) {
	return (
		<button
			className="osu-back"
			data-sound="none"
			onMouseEnter={() => uiSound('ui/default-hover')}
			onClick={() => {
				uiSound('ui/screen-back');
				onBack();
			}}
		>
			<span className="osu-back__icon">
				<svg viewBox="0 0 32 32" aria-hidden>
					<circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
					<path
						d="M18.5 10 L12.5 16 L18.5 22"
						fill="none"
						stroke="currentColor"
						strokeWidth="3"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
			<span className="osu-back__label"><Trans>back</Trans></span>
		</button>
	);
}
