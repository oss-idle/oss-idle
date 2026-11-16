import type { ReactNode } from 'react';

import {
	isWebOpen,
	webUrl,
} from '../../../globals';
import type { MenuTarget } from '../state';
import SenderName from './SenderName';

type Part = { at: number, text: string, node: ReactNode };

/** A server line's text: the player it names opens their menu, its `link` part a web platform page. */
export default function SystemText({ text, link, user }: {
	text: string,
	link?: { label: string, path: string },
	user?: MenuTarget,
}) {
	const open = (path: string) => {
		void webUrl.set(path);
		void isWebOpen.set(true);
	};
	const parts: Part[] = [];
	if (user) parts.push({
		at: text.indexOf(user.name), text: user.name, node: <SenderName sender={user} name={user.name} />,
	});
	if (link) parts.push({
		at: text.indexOf(link.label),
		text: link.label,
		node: <a className="chat__link" onClick={() => open(link.path)}>{link.label}</a>,
	});
	parts.sort((a, b) => a.at - b.at);

	const out: ReactNode[] = [];
	let at = 0;
	for (const part of parts) {
		if (part.at < at) continue; // absent (-1) or overlapping
		out.push(text.slice(at, part.at), <span key={part.at}>{part.node}</span>);
		at = part.at + part.text.length;
	}
	out.push(text.slice(at));
	return <>{out}</>;
}
