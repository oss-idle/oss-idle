import {
	useEffect,
	useRef,
} from 'react';

type Keys = {
	active: boolean,
	/** turn the picked skill around the ring */
	turn?: (by: number) => void,
	confirm?: () => void,
	/** answer the question shown, 0 to 3 */
	answer?: (i: number) => void,
};

/** Character creation's keys: arrows turn the ring, Enter begins, 1-4 answer the quiz. */
export default function useChoiceKeys(keys: Keys) {
	const latest = useRef(keys);
	latest.current = keys;
	useEffect(() => {
		const press = (e: KeyboardEvent) => {
			const k = latest.current;
			if (!k.active) return;
			const digit = Number(e.key);
			if (e.key === 'ArrowLeft' && k.turn) k.turn(-1);
			else if (e.key === 'ArrowRight' && k.turn) k.turn(1);
			else if (e.key === 'Enter' && k.confirm) k.confirm();
			else if (digit >= 1 && digit <= 4 && k.answer) k.answer(digit - 1);
			else return;
			e.preventDefault();
			e.stopPropagation();
		};
		window.addEventListener('keydown', press, { capture: true });
		return () => window.removeEventListener('keydown', press, { capture: true });
	}, []);
}
