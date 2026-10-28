import {
	type CSSProperties,
	type ReactNode,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

const place: CSSProperties = {
	position: 'fixed',
	display: 'flex',
	flexDirection: 'column',
	// above the client's page overlay (5000), which the upgrades panel opens in
	zIndex: 'var(--z-tooltip, 5200)',
	pointerEvents: 'none',
};

const box: CSSProperties = {
	padding: '0.4rem 0.6rem',
	borderRadius: 6,
	background: 'rgba(0, 0, 0, 0.85)',
	border: '1px solid rgba(255, 255, 255, 0.1)',
	boxShadow: '0 6px 18px rgba(0, 0, 0, 0.5)',
	fontSize: '0.75rem',
	fontWeight: 400,
	lineHeight: 1.6,
	whiteSpace: 'nowrap',
	textAlign: 'left',
};

/** Gap between the anchor and its card. */
const GAP_PX = 6;
/** Room needed above the anchor before the card is flipped under it. */
const FLIP_BELOW_PX = 120;
/** Closest the card comes to the window's sides. */
const EDGE_PX = 8;

/** Slides a card centred on its anchor back inside the window. */
const keepOnScreen = (el: HTMLSpanElement | null) => {
	if (!el) return;
	const r = el.getBoundingClientRect();
	const dx = Math.max(EDGE_PX - r.left, Math.min(0, innerWidth - EDGE_PX - r.right));
	if (dx) el.style.left = `${parseFloat(el.style.left) + dx}px`;
};

/**
 * A small card shown over its anchor while hovered. Portalled to the body so a
 * scroll container cannot clip it, which means it is placed by hand.
 */
export default function HoverCard({
	card,
	children,
	className,
	bare,
}: {
	/** nothing hovers when undefined */
	card: ReactNode,
	children: ReactNode,
	className?: string,
	/** the card draws its own box */
	bare?: boolean,
}) {
	const [at, setAt] = useState<DOMRect | undefined>(undefined);
	// flipped under the anchor when there is no room for it above
	const below = at !== undefined && at.top < FLIP_BELOW_PX;

	return <span
		className={className}
		// a tap would open it with nothing to close it
		onPointerEnter={e => e.pointerType !== 'touch' && setAt(e.currentTarget.getBoundingClientRect())}
		onPointerLeave={() => setAt(undefined)}
	>
		{children}
		{at !== undefined && card !== undefined && typeof document !== 'undefined' && createPortal(
			<span ref={keepOnScreen} style={{
				...place,
				...bare ? {} : box,
				left: at.left + at.width / 2,
				top: below ? at.bottom + GAP_PX : at.top - GAP_PX,
				transform: `translate(-50%, ${below ? '0' : '-100%'})`,
			}}>
				{card}
			</span>,
			document.body,
		)}
	</span>;
}
