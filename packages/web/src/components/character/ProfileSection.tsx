import { faBars } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useLingui } from '@lingui/react/macro';
import {
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from 'react';
import { flushSync } from 'react-dom';

import type { ProfileSection as Section } from '@oss-idle/shared/profile';

const SLIDE = {
	duration: 200, easing: 'ease-out',
};

const isShownSection = (s: Element): s is HTMLElement =>
	s instanceof HTMLElement && s.dataset.section !== undefined && s.offsetHeight > 0;

const shown = (el: HTMLElement) => [...el.parentElement?.children ?? []].filter(isShownSection);

/** The section the dragged one has crossed the middle of, if any. */
const crossed = (el: HTMLElement, dy: number) => {
	const list = shown(el);
	const i = list.indexOf(el);
	const prev = list[i - 1];
	const next = list[i + 1];
	const top = el.offsetTop + dy;
	if (next && top + el.offsetHeight > next.offsetTop + next.offsetHeight / 2) return next;
	if (prev && top < prev.offsetTop + prev.offsetHeight / 2) return prev;
	return undefined;
};

/** Keeps the dragged section within the first and last sections' span. */
const bounded = (el: HTMLElement, dy: number) => {
	const list = shown(el);
	const first = list[0];
	const last = list[list.length - 1];
	const min = first.offsetTop - el.offsetTop;
	const max = last.offsetTop + last.offsetHeight - el.offsetTop - el.offsetHeight;
	return Math.min(max, Math.max(min, dy));
};

/** One profile block; a supporter drags it by its handle to reorder their profile. */
export default function ProfileSection({ section, movable, onMove, onDrop, children }: {
	section: Section;
	movable: boolean;
	/** Put `from` where `to` is. */
	onMove: (from: Section, to: Section) => void;
	onDrop: () => void;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const el = useRef<HTMLDivElement>(null);
	const drag = useRef({
		startY: 0, clientY: 0, dy: 0,
	});
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		const node = el.current;
		if (!dragging || !node) return;
		const d = drag.current;

		const follow = () => {
			d.dy = d.clientY + window.scrollY - d.startY;
			for (let target = crossed(node, d.dy); target; target = crossed(node, d.dy)) {
				const list = shown(node);
				const before = list.map(s => s.offsetTop);
				flushSync(() => onMove(section, target.dataset.section as Section));
				list.forEach((s, i) => {
					const shift = before[i] - s.offsetTop;
					if (s === node) d.startY -= shift;
					else if (shift) s.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], SLIDE);
				});
				d.dy = d.clientY + window.scrollY - d.startY;
			}
			d.dy = bounded(node, d.dy);
			node.style.transform = `translateY(${d.dy}px)`;
		};
		const move = (e: PointerEvent) => { d.clientY = e.clientY; follow(); };
		const end = () => {
			node.style.transform = '';
			node.animate([{ transform: `translateY(${d.dy}px)` }, { transform: 'none' }], SLIDE);
			setDragging(false);
			onDrop();
		};

		window.addEventListener('pointermove', move);
		window.addEventListener('scroll', follow);
		window.addEventListener('pointerup', end);
		window.addEventListener('pointercancel', end);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('scroll', follow);
			window.removeEventListener('pointerup', end);
			window.removeEventListener('pointercancel', end);
		};
	}, [dragging, section, onMove, onDrop]);

	if (!movable) return <div className='character__section'>{children}</div>;

	return <div
		ref={el}
		data-section={section}
		className={`character__section${dragging ? ' character__section--dragging' : ''}`}
	>
		<span
			className='character__section-handle'
			title={t`Drag to reorder`}
			onPointerDown={e => {
				if (e.button !== 0) return;
				e.preventDefault();
				drag.current = {
					startY: e.clientY + window.scrollY, clientY: e.clientY, dy: 0,
				};
				setDragging(true);
			}}
		>
			<FontAwesomeIcon icon={faBars} />
		</span>
		{children}
	</div>;
}
