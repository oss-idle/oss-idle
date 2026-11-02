import './BeatmapCarousel.css';

import {
	Plural,
	Trans,
} from '@lingui/react/macro';
import {
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import type { MapTag } from '@oss-idle/shared/beatmap';

import { uiSound } from '../audio/uiSounds';
import type { PlaylistSlot } from '../db/schema/playlist';
import RightClick from '../input/RightClick';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import LightBeatmapSet from '../osu/beatmap/LightBeatmapSet';
import type { BeatmapXPInsight } from '../xpInsights';
import BeatmapCard from './BeatmapCard';
import { useSelection } from './songselect/selection';

export type DownloadStatus = 'idle' | 'downloading' | 'done';

export type DownloadState = {
	status: DownloadStatus,
	progress: number,
};

/** one carousel card = one difficulty, paired with its parent set */
export type CarouselItem = {
	beatmap: LightBeatmap,
	set: LightBeatmapSet,
	tags?: MapTag[],
	/** in the ranked catalog */
	ranked?: boolean,
	/** in the catalog as loved: no pp */
	loved?: boolean,
	/** its set ships in the bundled pack */
	bundled?: boolean,
	/** By Playlist: which copy of the difficulty in the playlist */
	entry?: PlaylistSlot,
};

export type CarouselHeaderRow = { 
	type: 'header', 
	key: string, 
	label: string, 
	count: number, 
	collapsed: boolean ,
};

/** A single virtualised row: either a difficulty card or a collapsible group
 *  header. Headers are the same height as cards so the uniform-STRIDE
 *  virtualisation (and the arc) hold regardless of grouping. */
export type CarouselRow =
	| { type: 'card', item: CarouselItem }
	| CarouselHeaderRow;

interface Props {
	rows: CarouselRow[]
	/** single click - select (and preview), or start if already selected */
	onCardClick: (beatmap: LightBeatmap) => void
	/** double click - download the set's .osz */
	onCardDoubleClick: (beatmap: LightBeatmap) => void
	/** right click (without dragging) - open the card's contextual menu */
	onCardRightClick: (item: CarouselItem) => void
	/** toggle a group header's collapsed state, by its key */
	onToggleGroup: (key: string) => void
	/** still loading the library */
	loading: boolean
	/** download state keyed by set .osz stem */
	downloads: Record<number, DownloadState>
	/** per-difficulty XP gain indicators; undefined while loading or locked */
	xpInsights?: Map<number, BeatmapXPInsight>
	/** total difficulties matching the search (for the footer; ignores collapse) */
	totalCount: number
	/** where the right button scrubs, besides the carousel itself */
	scrubArea?: RefObject<HTMLElement | null>
}

type Row = { el: HTMLElement, rect: DOMRect };

/** the nearer of the rows around a gap (rows run top to bottom), level with either */
const gapRow = (rows: Row[], x: number, y: number) => {
	const above = rows.findLast(({ rect }) => rect.bottom <= y);
	const below = rows.find(({ rect }) => rect.top >= y);
	if (!above || !below || x < Math.min(above.rect.left, below.rect.left)) return undefined;
	return y - above.rect.bottom <= below.rect.top - y ? above.el : below.el;
};

/**
 * the row (card or group header) at a point, or the nearer of the two around the
 * gap it is in (a hovered or selected row spreads its neighbours apart): the gaps
 * between rows belong to them
 */
const rowAt = (
	scroller: HTMLElement, x: number, y: number, target: EventTarget | null,
) => {
	const hit = (target as HTMLElement | null)?.closest?.('.bm-card');
	if (hit instanceof HTMLElement) return hit;
	const rows = [...scroller.querySelectorAll<HTMLElement>('.bm-card')]
		.map((el) => ({
			el, rect: el.getBoundingClientRect(), 
		}));
	// level with a row but off it: beside the rows, not in a gap
	const level = rows.find(({ rect }) => rect.top < y && y < rect.bottom);
	if (level) return x >= level.rect.left ? level.el : undefined;
	return gapRow(rows, x, y);
};

/** the right edge of the leaderboard's column: its panel, or its scores where they run past it */
const leaderboardRight = () => Math.max(
	document.querySelector('.lb')?.getBoundingClientRect().right ?? 0,
	document.querySelector('.score_entry__row')?.getBoundingClientRect().right ?? 0,
);

type Press = { clientX: number, clientY: number, target: EventTarget | null };

/**
 * the carousel's side of song select: level with it and right of the leaderboard's
 * column, the carousel shown, and off the leaderboard
 */
const carouselSide = (scroller: HTMLElement, press: Press) => {
	const { top, bottom } = scroller.getBoundingClientRect();
	return press.clientY >= top && press.clientY <= bottom
		&& !(press.target as HTMLElement | null)
			?.closest?.('.lb__select, .lb__list, .lb__empty, .lb__pb')
		&& press.clientX > leaderboardRight()
		&& getComputedStyle(scroller).pointerEvents !== 'none';
};

/** a right press there scrubs: the carousel's side, off its rows */
const scrubsAt = (scroller: HTMLElement, press: Press) =>
	carouselSide(scroller, press) && !rowAt(scroller, press.clientX, press.clientY, press.target);

/**
 * A collapsible group header row.
 * Shares `.bm-card` so it rides the same arc.
 */
function GroupHeader({ label, count, collapsed, onToggle }: {
	label: string, count: number, collapsed: boolean, onToggle: () => void,
}) {
	return (
		<div 
			className={`bm-card bm-group ${collapsed ? 'is-collapsed' : 'is-selected'}`} 
			data-sound="hover"
			onClick={() => {
				uiSound('songselect/select-group');
				onToggle();
			}}
		>
			<span 
				className="bm-group__label"
			>
				{label} (<Plural value={count} one="# map" other="# maps" />)
			</span>
		</div>
	);
}

/**
 * The radius (in half-heights) of the circle the carousel panels ride on.
 * This is the exact constant osu! uses; it gives the panels that signature
 * curve where the centre bows out to the left and the ends recede right.
 */
const CIRCLE_RADIUS = 3;

/**
 * Extra cards mounted above/below the viewport so a fast flick never blanks.
*/
const OVERSCAN = 5;
/** Card box height + bottom margin (negative: they overlap) - must match the CSS (.bm-card). */
const CARD_HEIGHT = 100;
const CARD_MARGIN = -8;
const STRIDE = CARD_HEIGHT + CARD_MARGIN;
/** How far a hovered or selected card pushes each neighbour away - the CSS's --spread. */
const SPREAD = 19;

/** A mounted card as the arc moves it: its XP section, its centre, its last offset. */
type Range = { start: number, end: number };
type Spreader = 'active' | 'hover';
type ArcCard = {
	el: HTMLElement, xp: HTMLElement | null, centre: number, bow: number,
	/** -1 above the active / hovered row, 1 below, 0 neither: data-active-side, data-hover-side */
	sides: Record<Spreader, number>,
};

const sideOf = (el: HTMLElement, by: Spreader) => {
	const side = el.getAttribute(`data-${by}-side`);
	return side === 'above' ? -1 : side === 'below' ? 1 : 0;
};

function setSide(card: ArcCard, by: Spreader, side: number) {
	if (card.sides[by] === side) return;
	card.sides[by] = side;
	if (side) card.el.setAttribute(`data-${by}-side`, side < 0 ? 'above' : 'below');
	else card.el.removeAttribute(`data-${by}-side`);
}

/** The cards of `rows[start, end)` as mounted, placed by the STRIDE grid: reading their
 *  offsets forced a layout each time the window moved. */
function arcCards(
	scroller: HTMLElement, rows: CarouselRow[], { start, end }: Range, top: number,
): ArcCard[] {
	const els = scroller.querySelectorAll<HTMLElement>('.bm-card');
	const cards: ArcCard[] = [];
	const last = Math.min(end, rows.length);
	// group headers are .bm-card too: they ride the arc, one element per row
	for (let i = start; i < last && cards.length < els.length; i++) {
		const el = els[cards.length];
		cards.push({
			el,
			xp: el.querySelector<HTMLElement>('.bm-card__xp'),
			centre: top + i * STRIDE + CARD_HEIGHT / 2,
			bow: parseFloat(el.style.translate) || 0,
			sides: {
				active: sideOf(el, 'active'), hover: sideOf(el, 'hover'),
			},
		});
	}
	return cards;
}

/**
 * osu!'s panel horizontal offset. `dist` is the panel's distance from the
 * vertical centre, normalised so 0 = dead centre and 1 = top/bottom edge.
 * Returns how far (px) the panel should be pushed back toward the right edge.
 */
function offsetX(dist: number, halfHeight: number): number {
	const discriminant = Math.max(0, CIRCLE_RADIUS * CIRCLE_RADIUS - dist * dist);
	return (CIRCLE_RADIUS - Math.sqrt(discriminant)) * halfHeight;
}

/**
 * The vertical, osu!-style carousel. Each card is a single difficulty; the
 * whole library is loaded and sorted globally by star rating. Single-click
 * selects (and previews); clicking an already selected, downloaded card starts
 * play; double-click downloads the set.
 *
 * The panels ride a circular arc (just like osu! stable): the card nearest the
 * vertical centre protrudes furthest left and cards above/below curve away to
 * the right. Selecting a card smoothly scrolls it to the centre.
 *
 * **Virtualisation.** The library can be hundreds of maps, so only the cards
 * near the viewport are mounted; the rest are stand-in spacer divs of the exact
 * height (cards are a fixed `STRIDE` apart).
 * 
 * The smooth-scroll animation and the
 * arc are pure DOM - they never call setState. The mounted window is updated
 * only from the scroll event, which the browser also fires for the animation's
 * programmatic scrolls, so a React re-render can never feed back into the
 * animation loop (that was the source of earlier render storms).
 */
export default function BeatmapCarousel({
	rows,
	onCardClick,
	onCardDoubleClick,
	onCardRightClick,
	onToggleGroup,
	loading,
	downloads,
	xpInsights,
	totalCount,
	scrubArea,
}: Props) {
	const selection = useSelection();
	const scrollRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef(0);
	// the scrollTop we're easing toward; null = no animation in flight
	const targetRef = useRef<number | null>(null);
	// scrollTop as last written or scrolled to: reading it in a frame callback, after
	// another one restyled the cards, forced a whole style + layout pass each time
	const posRef = useRef(0);
	const animRef = useRef(0);
	// timestamp of the previous animation frame, for time-based easing
	const lastTsRef = useRef(0);

	// the slice of `rows` currently mounted; everything else is a spacer
	const [range, setRange] = useState({
		start: 0, end: 0, 
	});
	const rangeRef = useRef(range);
	// the slice as last rendered, which the mounted cards are until the next commit
	const shownRef = useRef(range);
	shownRef.current = range;
	// live rows, for the centering glide: selection.use() captures its
	// callback once and so can't close over the latest `rows` prop.
	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	/**
	 * The scroller's top padding (the carousel is padded so the ends can centre).
	 */
	const padTop = useCallback((): number => {
		const scroller = scrollRef.current;
		return scroller ? parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0;
	}, []);

	// Scrolling runs the window and arc every frame. Reading the padding, the height or
	// a card's offset there forces a style + layout pass right after the arc's writes,
	// and none of them move while scrolling: they're read again only after a resize or
	// a change of rows (forget()).
	const geometryRef = useRef<{ padTop: number; height: number } | undefined>(undefined);
	// the mounted cards as the arc draws them, found again only when they change: a
	// query, a read-back and new strings per card per frame were the song select's stutter
	const cardsRef = useRef<ArcCard[] | undefined>(undefined);
	// the row the mouse is on, gaps included (data-hover), and where the mouse is
	const hoverRef = useRef<HTMLElement | undefined>(undefined);
	const pointerRef = useRef({
		x: 0, y: 0, over: false, 
	});
	const settleRef = useRef(0);
	const geometry = useCallback((scroller: HTMLElement) => geometryRef.current ??= {
		padTop: padTop(), height: scroller.clientHeight,
	}, [padTop]);
	const forget = useCallback(() => {
		geometryRef.current = undefined;
		cardsRef.current = undefined;
	}, []);

	/** Which cards should be mounted for the current scroll position. */
	const syncWindow = useCallback(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const { padTop: top, height } = geometry(scroller);
		let first = Math.floor((posRef.current - top) / STRIDE);
		// the list shrank under the view (a search): the browser clamps once it has rendered
		if (first >= rows.length) {
			first = rows.length - 1;
			targetRef.current = null;
		}
		const visible = Math.ceil(height / STRIDE);
		const start = Math.max(0, first - OVERSCAN);
		const end = Math.min(rows.length, Math.max(start, first + visible + OVERSCAN));
		if (start !== rangeRef.current.start || end !== rangeRef.current.end) {
			rangeRef.current = {
				start, end, 
			};
			setRange({
				start, end, 
			});
		}
	}, [rows.length, geometry]);

	/**
	 * Re-apply the circular-arc offset to every mounted card (and the counter-shift
	 * of its XP section). Pure DOM, no state.
	 */
	const updateCurve = useCallback((scrollTop = posRef.current) => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const { padTop: top, height } = geometry(scroller);
		const halfHeight = height / 2;
		if (halfHeight <= 0) return;
		const cards = cardsRef.current ??= arcCards(scroller, rowsRef.current, shownRef.current, top);
		let active = -1;
		let hover = -1;
		for (let i = 0; i < cards.length; i++) {
			if (cards[i].el.classList.contains('is-active')) active = i;
			if (cards[i].el === hoverRef.current) hover = i;
		}
		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];
			const activeSide = active < 0 ? 0 : Math.sign(i - active);
			const hoverSide = hover < 0 ? 0 : Math.sign(i - hover);
			setSide(card, 'active', activeSide);
			setSide(card, 'hover', hoverSide);
			// panel centre relative to the top of the viewport, spread included
			const drawY = card.centre - scrollTop + (activeSide + hoverSide) * SPREAD;
			// 0 at centre, 1 at the top/bottom edges (clamped beyond)
			const dist = Math.abs(1 - drawY / halfHeight);
			// half pixels: finer moves nothing on screen, and each write restyles the card
			const bow = Math.round(offsetX(dist, halfHeight) * 2) / 2;
			if (bow === card.bow) continue;
			card.bow = bow;
			card.el.style.translate = `${bow}px`;
			if (card.xp) card.xp.style.translate = `${-bow}px`;
		}
	}, [geometry]);

	/**
	 * Ease scrollTop toward `targetRef`. The smoothing is *time-based* (the rate
	 * is converted to the elapsed frame time), so a momentary main-thread stall -
	 * e.g. the synchronous .osz unzip when a downloaded map is selected - is
	 * absorbed as a single catch-up rather than re-easing from where it froze.
	 * Pure DOM: writes scrollTop and the arc, never React state. The mounted
	 * window keeps up because each scrollTop write fires a scroll event (onScroll).
	 */
	const stepScroll = useCallback(
		(ts: number) => {
			const scroller = scrollRef.current;
			if (!scroller || targetRef.current === null) {
				animRef.current = 0;
				return;
			}
			// elapsed time since the last frame (0 on the first frame of a run)
			const dt = lastTsRef.current ? ts - lastTsRef.current : 0;
			lastTsRef.current = ts;

			const current = posRef.current;
			const diff = targetRef.current - current;
			// < 1px: some browsers round scrollTop to whole pixels, so a fractional
			// target would never cross a sub-pixel threshold and the glide (and its
			// per-frame work) would spin forever.
			if (Math.abs(diff) < 1) {
				scroller.scrollTop = posRef.current = targetRef.current;
				targetRef.current = null;
				animRef.current = 0;
				updateCurve();
				return;
			}
			// frame-rate-independent exponential smoothing: reach ~0.2/frame @60fps,
			// but after a long stall dt is large so we snap most of the way at once.
			const factor = 1 - Math.pow(1 - 0.22, dt / 16.6667);
			const next = current + diff * factor;
			scroller.scrollTop = posRef.current = next;
			updateCurve(next);
			animRef.current = requestAnimationFrame(stepScroll);
		},
		[updateCurve],
	);

	/**
	 * Point the animator at a clamped scroll target (wheel, scrollbar, centering).
	 */
	const animateTo = useCallback(
		(top: number) => {
			const scroller = scrollRef.current;
			if (!scroller) return;
			const max = scroller.scrollHeight - scroller.clientHeight;
			targetRef.current = Math.max(0, Math.min(max, top));
			if (!animRef.current) {
				lastTsRef.current = 0;
				animRef.current = requestAnimationFrame(stepScroll);
			}
		},
		[stepScroll],
	);

	/**
	 * osu!-style right-drag scrub: map the cursor's vertical position in the
	 * viewport straight to a scroll fraction and jump there immediately (no glide).
	 * Lets you cross thousands of results in one drag. Cancels any in-flight glide
	 * so it doesn't fight the scrub for scrollTop.
	 */
	const scrubTo = useCallback((clientY: number) => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const rect = scroller.getBoundingClientRect();
		const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
		targetRef.current = null;
		scroller.scrollTop = posRef.current = frac * (scroller.scrollHeight - scroller.clientHeight);
		updateCurve();
	}, [updateCurve]);

	/**
	 * Glide the selected card to the vertical centre. The target is the card's
	 * *index* position (cards are a fixed stride apart), so it works even when the
	 * active card is currently virtualised out - e.g. re-entering song select
	 * scrolled to the top with a far-down selection.
	 */
	// the beatmap id we last glided to, so a mere collapse/expand (which rebuilds
	// `rows`) doesn't yank the view back to the selection in some other group.
	const lastCenteredRef = useRef<number | null>(null);
	// the header just toggled and its offset in the viewport: closing a taller group
	// above it shrinks the list, and the browser would clamp the old scrollTop
	const toggledRef = useRef<{ key: string, offset: number } | undefined>(undefined);
	const toggleGroup = useCallback((key: string) => {
		const i = rowsRef.current.findIndex(r => r.type === 'header' && r.key === key);
		toggledRef.current = {
			key, offset: i * STRIDE - posRef.current, 
		};
		onToggleGroup(key);
	}, [onToggleGroup]);
	const centerOnActive = useCallback(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const current = selection.get();
		const i = current
			? rowsRef.current
				.findIndex(r => r.type === 'card' && r.item.beatmap.is(current))
			: -1;
		if (i < 0) return;
		lastCenteredRef.current = current!.metadata.id;
		const cardCentre = padTop() + i * STRIDE + CARD_HEIGHT / 2;
		animateTo(cardCentre - scroller.clientHeight / 2);
	}, [animateTo, padTop, selection]);

	// Take over the mouse wheel so scrolling is always smooth, never harsh - over the
	// carousel and anywhere on its side of song select, the leaderboard keeping its own.
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const area = scrubArea?.current ?? scroller;
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey) return; // let pinch-zoom through
			if (!scroller.contains(e.target as Node) && !carouselSide(scroller, e)) return;
			e.preventDefault();
			// normalise line/page deltas to pixels
			const unit =
				e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1;
			const base = targetRef.current ?? posRef.current;
			animateTo(base + e.deltaY * unit);
		};
		area.addEventListener('wheel', onWheel, { passive: false });
		return () => area.removeEventListener('wheel', onWheel);
	}, [animateTo, scrubArea]);

	// The right mouse button does two osu!-stable gestures: *dragging* off the
	// rows scrubs the whole list (the cursor's vertical position maps to an
	// absolute scroll fraction), while a *click* - press and release without
	// moving - over a card opens its contextual menu. The press is held back
	// until it travels past a small threshold (commit to scrubbing), so neither
	// gesture disturbs the other; the click path is the app-wide RightClick
	// gesture below, which cancels itself on the same kind of movement. The
	// browser context menu is suppressed globally (Controls), not here.
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const area = scrubArea?.current ?? scroller;
		const DRAG_PX = 6;
		let pendingY: number | null = null;
		let scrubbing = false;
		const onDown = (e: MouseEvent) => {
			if (e.button !== 2 || !scrubsAt(scroller, e)) return;
			e.preventDefault();
			pendingY = e.clientY;
			scrubbing = false;
		};
		const onMove = (e: MouseEvent) => {
			if (pendingY === null && !scrubbing) return;
			if (pendingY !== null && Math.abs(e.clientY - pendingY) < DRAG_PX) return;
			pendingY = null;
			scrubbing = true;
			e.preventDefault();
			scrubTo(e.clientY);
		};
		const onUp = (e: MouseEvent) => {
			if (e.button !== 2) return;
			pendingY = null;
			scrubbing = false;
		};
		area.addEventListener('mousedown', onDown);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			area.removeEventListener('mousedown', onDown);
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [scrubTo, scrubArea]);

	// the right-click commit (mouse right button, or touch long-press): over a
	// card opens its contextual menu, off the rows jumps the scroll there
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		return RightClick.on(scrubArea?.current ?? scroller, (e) => {
			const card = rowAt(scroller, e.clientX, e.clientY, e.target);

			if (card?.dataset.id) {
				const id = Number(card.dataset.id);
				const row = rowsRef.current.find((r) => r.type === 'card'
					&& r.item.beatmap.is(id) && r.item.beatmap.lock === card.dataset.lock);

				if (row?.type === 'card') onCardRightClick(row.item);
				return;
			}
			if (scrubsAt(scroller, e)) scrubTo(e.clientY);
		});
	}, [scrubTo, onCardRightClick, scrubArea]);

	const setHover = useCallback((row: HTMLElement | undefined) => {
		if (row === hoverRef.current) return;
		hoverRef.current?.removeAttribute('data-hover');
		row?.setAttribute('data-hover', '');
		hoverRef.current = row;
		updateCurve();
	}, [updateCurve]);

	// osu!'s hover belongs to the panel and to the gaps its spread opens, so a panel
	// never flickers in and out of hover at its edges. Mouse only. A scroll moves the
	// rows under a still cursor: the hover is found again once it settles, as a hit
	// test every frame would force a layout every frame.
	const syncHover = useCallback(() => {
		const scroller = scrollRef.current;
		const { x, y, over } = pointerRef.current;
		if (!scroller || !over) return;
		setHover(rowAt(scroller, x, y, document.elementFromPoint(x, y)));
	}, [setHover]);
	useEffect(() => {
		const scroller = scrollRef.current;
		if (!scroller) return;
		const pointer = pointerRef.current;
		const onMove = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse') return;
			pointer.x = e.clientX;
			pointer.y = e.clientY;
			pointer.over = true;
			setHover(rowAt(scroller, e.clientX, e.clientY, e.target));
		};
		const onLeave = () => {
			pointer.over = false;
			setHover(undefined);
		};
		// a click in a hovered row's gap is the row's
		const onClick = (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('.bm-card')) return;
			hoverRef.current?.click();
		};
		scroller.addEventListener('pointermove', onMove);
		scroller.addEventListener('pointerleave', onLeave);
		scroller.addEventListener('click', onClick);
		return () => {
			clearTimeout(settleRef.current);
			scroller.removeEventListener('pointermove', onMove);
			scroller.removeEventListener('pointerleave', onLeave);
			scroller.removeEventListener('click', onClick);
		};
	}, [setHover]);

	// The single scroll handler: fires for native scrolls (scrollbar, touch, keys)
	// AND for the animation's programmatic scrollTop writes. rAF-throttled; updates
	// the mounted window and the arc together. The *only* path that setStates the
	// window, so the animation loop can never feed back on itself.
	const onScroll = useCallback(() => {
		// the browser's own position (it clamps); a glide's is already in posRef, and
		// reading it after React mounted the next cards forced a style + layout pass
		if (targetRef.current === null) posRef.current = scrollRef.current?.scrollTop ?? 0;
		scrollRef.current?.classList.add('is-scrolling');
		clearTimeout(settleRef.current);
		settleRef.current = window.setTimeout(() => {
			scrollRef.current?.classList.remove('is-scrolling');
			syncHover();
		}, 80);
		if (rafRef.current) return;
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = 0;
			syncWindow();
			updateCurve();
		});
	}, [syncWindow, updateCurve, syncHover]);

	// Re-bow the newly-mounted cards the instant the window changes (before paint),
	// so cards scrolling into view never flash un-curved. Arc only, never setState.
	// An XP section mounts when its insight arrives, and needs the arc's counter-shift.
	useLayoutEffect(() => {
		cardsRef.current = undefined;
		updateCurve();
	}, [range, xpInsights, updateCurve]);

	// On mount / when the library changes / on resize: fit the window, draw the
	// arc, and re-aim the centering glide. The selected-beatmap subscription fires
	// once on mount, which can race ahead of the library loading, so re-center here
	// too once the items are in.
	useLayoutEffect(() => {
		forget();
		const toggled = toggledRef.current;
		toggledRef.current = undefined;
		if (toggled && scrollRef.current) {
			const i = rows.findIndex(r => r.type === 'header' && r.key === toggled.key);
			targetRef.current = null;
			scrollRef.current.scrollTop = i * STRIDE - toggled.offset;
		}
		posRef.current = scrollRef.current?.scrollTop ?? 0;
		syncWindow();
		updateCurve();
		// center only when the selection itself is new (initial load / re-entry),
		// never on a plain group collapse/expand that just reshapes `rows`.
		const current = selection.get();
		if (current && lastCenteredRef.current !== current.metadata.id)
			centerOnActive();

		const scroller = scrollRef.current;
		if (!scroller) return;
		const ro = new ResizeObserver(() => {
			forget();
			posRef.current = scroller.scrollTop;
			syncWindow();
			updateCurve();
		});
		ro.observe(scroller);
		return () => ro.disconnect();
	}, [syncWindow, updateCurve, centerOnActive, rows, forget]);

	// Cancel any in-flight animation frames on unmount.
	useEffect(
		() => () => {
			if (animRef.current) cancelAnimationFrame(animRef.current);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			animRef.current = 0;
			rafRef.current = 0;
		},
		[],
	);

	selection.use(beatmap => {
		// the active card spreads its neighbours: re-bow once the cards show it
		requestAnimationFrame(() => updateCurve());
		if (!beatmap) return;
		centerOnActive();
	});

	const { start, end } = range;
	return (
		<div className="carousel" ref={scrollRef} onScroll={onScroll}>
			<div className="carousel__list">
				{start > 0 && <div 
					className="carousel__spacer" 
					style={{ height: start * STRIDE }} 
				/>}

				{rows.slice(start, end).map(row =>
					row.type === 'header'
						? <GroupHeader
							key={`h:${row.key}`}
							label={row.label}
							count={row.count}
							collapsed={row.collapsed}
							onToggle={() => toggleGroup(row.key)}
						/>
						: <BeatmapCard
							key={`c:${row.item.beatmap.metadata.id}:${row.item.beatmap.lock}`
								+ `:${row.item.entry?.id ?? ''}`}
							beatmap={row.item.beatmap}
							set={row.item.set}
							onCardClick={onCardClick}
							onCardDoubleClick={onCardDoubleClick}
							downloads={downloads}
							xpInsight={xpInsights?.get(row.item.beatmap.metadata.id)}
						/>,
				)}

				{end < rows.length && (
					<div 
						className="carousel__spacer" 
						style={{ height: (rows.length - end) * STRIDE }}
					/>
				)}

				{loading && (
					<div className="carousel__sentinel"><Trans>loading library…</Trans></div>
				)}
				{!loading && rows.length === 0 && (
					<div className="carousel__empty"><Trans>no maps match your search</Trans></div>
				)}
				{!loading && totalCount > 0 && (
					<div 
						className="carousel__end"
					>
						- <Plural
							value={totalCount}
							one="that's all # difficulty"
							other="that's all # difficulties"
						/> -
					</div>
				)}
			</div>
		</div>
	);
}
