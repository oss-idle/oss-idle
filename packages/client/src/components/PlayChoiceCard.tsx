import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ReactNode } from 'react';

/** One side of the play choice: a dialog card with its icon, what it means, and its button. */
export default function PlayChoiceCard({
	icon, title, text, warning, button, accent, disabled, onPick,
}: {
	icon: IconDefinition,
	title: ReactNode,
	text: ReactNode,
	warning?: ReactNode,
	button: ReactNode,
	accent: 'pink' | 'blue',
	disabled?: boolean,
	onPick: () => void,
}) {
	return (
		<div className="play-choice__card">
			<div className="play-choice__ring"><FontAwesomeIcon icon={icon} /></div>
			<h2>{title}</h2>
			<p className="play-choice__text">{text}</p>
			<p className="play-choice__warn">{warning}</p>
			<div className="play-choice__actions">
				<button
					className={`play-choice__btn play-choice__btn--${accent}`}
					disabled={disabled}
					onClick={onPick}
				>
					<span>{button}</span>
				</button>
			</div>
		</div>
	);
}
