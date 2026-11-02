import {
	around,
	type UiSound,
	uiSound,
} from './uiSounds';

/** osu!'s text box sounds: keys, deleting, moving the caret, selecting, Enter. */

const TEXT_TYPES = new Set(['text', 'search', 'password', 'email', 'url', 'number', 'tel']);

const textField = (target: EventTarget | null) => {
	if (target instanceof HTMLTextAreaElement) return target;
	if (target instanceof HTMLInputElement && TEXT_TYPES.has(target.type)) return target;
	return undefined;
};

const PRESSES: UiSound[] = [
	'keyboard/key-press-1', 'keyboard/key-press-2', 'keyboard/key-press-3', 'keyboard/key-press-4',
];
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

const play = (sound: UiSound, pitch = 1) => uiSound(sound, {
	pitch: pitch * around(0.02), gap: 15, 
});

const selection = (field: HTMLInputElement | HTMLTextAreaElement) => {
	try {
		return (field.selectionEnd ?? 0) - (field.selectionStart ?? 0);
	} catch {
		// number and email fields have no selection to read
		return 0;
	}
};

/** what the selection looks like after this key, measured once the browser applied it */
type Field = HTMLInputElement | HTMLTextAreaElement;

const afterMove = (field: Field, e: KeyboardEvent, had: number) => {
	requestAnimationFrame(() => {
		const now = selection(field);
		if (!e.shiftKey) {
			play(had ? 'keyboard/deselect' : 'keyboard/key-movement');
			return;
		}
		if (e.ctrlKey || e.altKey) play('keyboard/select-word');
		else play('keyboard/select-char', 1 + now / Math.max(1, field.value.length) * 0.15);
	});
};

const typed = (field: HTMLInputElement | HTMLTextAreaElement, key: string) => {
	const full = field.maxLength > 0 && field.value.length - selection(field) >= field.maxLength;
	if (full) play('keyboard/key-invalid');
	else if (key !== key.toLowerCase() && field.type !== 'password') play('keyboard/key-caps');
	else play(PRESSES[Math.floor(Math.random() * PRESSES.length)]);
};

/** a key that edits: Enter, deleting, or a character */
const edit = (field: Field, key: string) => {
	if (key === 'Enter') play('keyboard/key-confirm');
	else if (key === 'Backspace' || key === 'Delete') {
		if (field.value.length) play('keyboard/key-delete');
	} else if (key.length === 1) typed(field, key);
};

const onKey = (e: KeyboardEvent) => {
	const field = textField(e.target);
	if (!field || field.readOnly || field.disabled) return;
	const had = selection(field);
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') play('keyboard/select-all');
	else if (MOVES.has(e.key)) afterMove(field, e, had);
	else if (!e.ctrlKey && !e.metaKey && !e.altKey) edit(field, e.key);
};

/** Typing sounds for every text field on the page. */
export const installTypingSounds = () => {
	document.addEventListener('keydown', onKey, true);
	return () => document.removeEventListener('keydown', onKey, true);
};
