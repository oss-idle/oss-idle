import {
	type RefObject,
	useCallback,
	useState,
} from 'react';

import {
	replyBody,
	type ReplyTarget,
} from './replies';

type Line = { id: string, name?: string, fromColor?: string, text: string };

/** Answering a line: who, the bar above the input, what you send, and the way back to it. */
export default function useReply(
	lines: readonly Line[],
	logRef: RefObject<HTMLDivElement>,
	inputRef: RefObject<HTMLInputElement>,
) {
	const [target, setTarget] = useState<ReplyTarget>();

	const start = useCallback((line: Line) => {
		if (!line.name) return;
		setTarget({
			id: line.id, name: line.name, color: line.fromColor, text: line.text,
		});
		inputRef.current?.focus();
	}, [inputRef]);
	const cancel = () => setTarget(undefined);

	/** What to send and the line it answers; a /command goes as it is. */
	const send = (text: string): { text: string, replyTo?: string } => {
		if (!target || text.startsWith('/')) return { text };
		setTarget(undefined);
		return {
			text: replyBody(target.name, text), replyTo: target.id,
		};
	};

	// Escape with nothing else open drops the reply, the chat stays
	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): boolean => {
		if (!target || e.key !== 'Escape') return false;
		e.preventDefault();
		e.stopPropagation();
		setTarget(undefined);
		return true;
	};

	const inLog = (id: string) => lines.some(l => l.id === id);

	/** The answered line, brought into view and lit for a moment. */
	const jump = useCallback((id: string) => {
		const row = logRef.current?.querySelector<HTMLElement>(`[data-line="${CSS.escape(id)}"]`);
		if (!row) return;
		row.scrollIntoView({
			block: 'center', behavior: 'smooth',
		});
		row.classList.remove('is-flash');
		void row.offsetWidth;
		row.classList.add('is-flash');
	}, [logRef]);

	return {
		target, start, cancel, send, onKeyDown, inLog, jump,
	};
}
