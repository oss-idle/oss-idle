import { t } from '@lingui/core/macro';

import type { ReplyQuote } from '@oss-idle/shared/community/wire';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { blocked } from '../../../online/blocks';

/** Over a reply: who it answers and what they said, joined to the line by a thin curve; clicking goes to
 *  that line while it's in the log. */
export default function ReplyRef({ to, there, onJump }: {
	to: ReplyQuote | undefined,
	there: boolean,
	onJump: (id: string) => void,
}) {
	const [blockedIds = new Set<number>()] = useSynced(blocked);
	if (!to) return null;
	if (blockedIds.has(to.userId)) {
		return <button type="button" className="chat__reply-ref" disabled><span>{'<block>'}</span></button>;
	}
	return (
		<button
			type="button" className="chat__reply-ref"
			aria-label={there ? t`Go to the message` : undefined}
			disabled={!there}
			onClick={() => onJump(to.id)}
		>
			<b style={{ color: to.color }}>{to.name}</b>
			<span>{to.text}</span>
		</button>
	);
}
