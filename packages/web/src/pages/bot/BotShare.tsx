import { Trans } from '@lingui/react/macro';
import { useState } from 'react';

/** Copies the link to a match. */
export default function BotShare({ link, main }: {
	link: string;
	main?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const share = () => navigator.clipboard.writeText(link).then(() => setCopied(true));
	return <button className={`bot-button ${main ? 'is-main' : ''}`} onClick={() => void share()}>
		{copied ? <Trans>Link copied</Trans> : <Trans>Share</Trans>}
	</button>;
}
