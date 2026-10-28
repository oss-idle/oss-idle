import {
	createContext,
	type RefObject,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from 'react';

/** Where a surface sits, bottom to top, as the CSS stacks them. */
export const LAYER = {
	SCENE: 0,
	PAGE: 1,
	COMMUNITY: 2,
	OVER_CHAT: 3,
	MEDALS: 4,
	OPTIONS: 5,
	WEB: 6,
	TUTORIAL: 7,
	PLAY_CHOICE: 8,
	ONBOARDING: 9,
} as const;

/** The layer the surfaces inside a host belong to (a page, the community
 *  overlay...); a host that is closing (still on screen while it animates out)
 *  lets go for all of them. */
export const KeyboardLayer = createContext<{ layer: number, open: boolean }>({
	layer: LAYER.SCENE, open: true,
});

type Target = RefObject<HTMLElement | null>;
type Close = RefObject<(() => void) | undefined>;
type Owner = { layer: number, seq: number, target?: Target, close: Close };

const owners = new Set<Owner>();
let current: Owner | undefined;
let counter = 0;
let taking: ReturnType<typeof setTimeout> | undefined;
let reclaiming: ReturnType<typeof setTimeout> | undefined;

const TEXT_TYPES = new Set(['text', 'search', 'password', 'email', 'url', 'number', 'tel']);

const isText = (el: Element | null) =>
	el instanceof HTMLTextAreaElement
	|| el instanceof HTMLIFrameElement
	|| (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && !el.readOnly);

/** Form controls keep the focus a click gave them; a button or the page does not. */
const holdsFocus = (el: Element | null) =>
	el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
	|| el instanceof HTMLSelectElement || el instanceof HTMLIFrameElement;

export const typing = (key: KeyboardEvent) =>
	key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey;

const above = (a: Owner, b: Owner) => a.layer > b.layer || (a.layer === b.layer && a.seq > b.seq);

const top = () => {
	let best: Owner | undefined;
	for (const o of owners) {
		if (!best || above(o, best)) best = o;
	}
	return best;
};

/** Whether a surface holds the keyboard: a scene's own keys wait while one is open. */
export const keyboardClaimed = (): boolean => owners.size > 0;

/** Escape: close the topmost surface that can be closed. False when none is open. */
export const closeTop = (): boolean => {
	const close = [...owners]
		.sort((a, b) => (above(a, b) ? -1 : 1))
		.find(o => o.close.current)?.close.current;
	close?.();
	return !!close;
};

const take = () => {
	const el = current?.target?.current;
	if (el) el.focus({ preventScroll: true });
	else if (isText(document.activeElement)) (document.activeElement as HTMLElement).blur();
};

const reclaim = () => {
	if (current?.target && !holdsFocus(document.activeElement)) take();
};

const settle = () => {
	const next = top();
	if (next === current) return;
	current = next;
	// a timer, not a frame: the frame limiter can hold frames back for long
	clearTimeout(taking);
	taking = setTimeout(take);
};

const reclaimLater = () => {
	clearTimeout(reclaiming);
	reclaiming = setTimeout(reclaim);
};

document.addEventListener('focusout', reclaimLater);
window.addEventListener('focus', reclaimLater);
// a printable key lands in the owner's box even when focus was elsewhere
window.addEventListener('keydown', (e) => {
	const el = current?.target?.current;
	if (el && typing(e) && document.activeElement !== el && !isText(document.activeElement)) {
		el.focus({ preventScroll: true });
	}
}, { capture: true });

type Options = {
	active?: boolean,
	/** for a surface hooked outside its host's layer */
	layer?: number,
	/** what Escape does while this is the topmost surface that has one */
	close?: () => void,
};

/**
 * Claim the keyboard while `active`: the topmost claim (by layer, then the
 * latest opened) holds focus in its `target`, taken back after a click, a
 * window switch or a key typed elsewhere. Without a target the claim only
 * keeps typing out of what is underneath.
 */
export default function useKeyboardOwner(
	target?: Target,
	{ active = true, layer, close }: Options = {},
) {
	const context = useContext(KeyboardLayer);
	const at = layer ?? context.layer;
	active &&= context.open;
	// a ref: a new callback each render must not re-claim (and refocus)
	const closeRef = useRef(close);
	closeRef.current = close;
	// taken at render, which runs parent before child: a surface opened inside
	// another outranks it
	const seq = useMemo(() => (active ? ++counter : 0), [active]);
	useEffect(() => {
		if (!active) return;
		const owner: Owner = {
			layer: at, seq, target, close: closeRef,
		};
		owners.add(owner);
		settle();
		return () => {
			owners.delete(owner);
			settle();
		};
	}, [active, at, seq, target]);
}
