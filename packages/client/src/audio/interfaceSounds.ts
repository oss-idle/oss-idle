import {
	around,
	type UiSound,
	uiSound,
} from './uiSounds';

/**
 * The sounds every control shares, as in osu!: hover and click on anything clickable, and
 * the cursor tapping down and up. A control picks its set with `data-sound`:
 * `button` (osu!'s buttons), `hover` (its own click sound), `none` (its own sounds), or
 * nothing for the default set.
 */

const CLICKABLE = [
	'button', 'a[href]', '[role=button]', '[role=option]', '[role=tab]', '[role=menuitem]', '[data-sound]',
].join(', ');

type SoundSet = 'default' | 'button' | 'hover' | 'none';

const clickable = (target: EventTarget | null) =>
	(target instanceof Element ? target.closest(CLICKABLE) ?? undefined : undefined);

const setOf = (el: Element): SoundSet => {
	const set = el.closest('[data-sound]')?.getAttribute('data-sound');
	return set === 'button' || set === 'hover' || set === 'none' ? set : 'default';
};

const disabled = (el: Element) => el.matches(':disabled, [aria-disabled=true], .disabled');

const HOVER: Record<'default' | 'button', UiSound> = {
	default: 'ui/default-hover',
	button: 'ui/button-hover',
};
const SELECT: Record<'default' | 'button', UiSound> = {
	default: 'ui/default-select',
	button: 'ui/button-select',
};

/** -0.6 at the left edge to 0.6 at the right, like osu!'s cursor */
const panAt = (x: number) => (x / window.innerWidth * 2 - 1) * 0.6;

let hovered: Element | undefined;

const onOver = (e: PointerEvent) => {
	const el = clickable(e.target);
	if (el === hovered) return;
	hovered = el;
	if (!el || e.buttons || disabled(el)) return;
	const set = setOf(el);
	if (set === 'none') return;
	uiSound(HOVER[set === 'button' ? 'button' : 'default'], { pitch: around(0.02) });
};

const onClick = (e: MouseEvent) => {
	if (e.button !== 0) return;
	const el = clickable(e.target);
	if (!el) return;
	const set = setOf(el);
	if (set === 'none' || set === 'hover') return;
	uiSound(SELECT[set], { pitch: around(0.01) });
};

/** disabled buttons never get a click, but osu! answers them with a dull knock */
const onDown = (e: PointerEvent) => {
	if (e.button !== 0) return;
	const el = clickable(e.target);
	if (el && disabled(el) && setOf(el) !== 'none') uiSound('ui/default-select-disabled');
};

/**
 * Hover, click and the cursor's taps for the whole page. `tapping` says whether the cursor
 * taps sound (osu! keeps them to its menus).
 */
export const installInterfaceSounds = (tapping: () => boolean) => {
	const tapDown = (e: PointerEvent) => {
		if (e.button === 0 && tapping()) {
			uiSound('ui/cursor-tap', {
				pitch: around(0.01), pan: panAt(e.clientX), 
			});
		}
	};
	const tapUp = (e: PointerEvent) => {
		if (e.button === 0 && !e.buttons && tapping()) {
			uiSound('ui/cursor-tap', {
				volume: 0.8, pan: panAt(e.clientX), 
			});
		}
	};
	document.addEventListener('pointerover', onOver);
	document.addEventListener('pointerdown', onDown);
	document.addEventListener('pointerdown', tapDown);
	document.addEventListener('pointerup', tapUp);
	document.addEventListener('click', onClick);
	return () => {
		document.removeEventListener('pointerover', onOver);
		document.removeEventListener('pointerdown', onDown);
		document.removeEventListener('pointerdown', tapDown);
		document.removeEventListener('pointerup', tapUp);
		document.removeEventListener('click', onClick);
	};
};
