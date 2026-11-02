import type { PageAction } from './pageBar';

/** One bottom-bar action: a button, or a static (non-interactive) label.
 *  `order` maps to the flex order, so defaults and appended actions interleave.
 */
export default function PageBarButton({ action }: { action: PageAction }) {
	const { label, onClick, disabled, order = 0, static: isStatic } = action;

	const className = `
		page__baraction
		${isStatic ? ' page__baraction--static' : ''}
	`;

	return isStatic
		? <span 
			className={className} 
			style={{ order }}
		>
			{label}
		</span>
		: <button 
			className={className}
			data-sound="button"
			style={{ order }}
			disabled={disabled}
			onClick={onClick}
		>
			{label}
		</button>
	;
}
