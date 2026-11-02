import './Button.css';

import { ReactNode } from 'react';

interface Props {
	label: ReactNode;
	onClick: () => void;
	/** Bar accent colour (any CSS colour). Defaults to the osu! pink. */
	accent?: string;
}

/**
 * osu!-style settings button: a full-width accented bar.
 * Purely presentational : the caller owns what it does.
 */
export default function Button({ label, onClick, accent }: Props) {
	const style = accent ? ({ '--accent': accent } as React.CSSProperties) : undefined;
	
	return (
		<button type="button" className="opt-button" style={style} onClick={onClick} data-sound="button">
			{label}
		</button>
	);
}
