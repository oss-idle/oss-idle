import useSynced from '@oss-idle/shared/hooks/useSynced';
import useSyncedSelect from '@oss-idle/shared/hooks/useSyncedSelect';

import Entities from '../../../entity/entities';
import {
	isWebOpen,
	webUrl,
} from '../../../globals';
import { emoji } from '../../../online/emoji';
import Socket from '../../../online/socket';
import { linkFor } from '../state';
import ChatEmoji from './ChatEmoji';
import { splitLinks } from './links';
import { mentionPattern } from './mentionQuery';
import { openChatMap } from './openMap';

/** A line's text cut around the emoji its sender may use. */
type Split = (text: string) => ReturnType<ReturnType<typeof emoji.get>['split']>;

/** The text with its emoji as images. */
const withEmoji = (split: Split, text: string, key: number) => split(text).map((part, i) =>
	typeof part === 'string' ? part : <ChatEmoji key={`${key}.${i}`} emoji={part} />);

// one pattern per set of online names (every line shares it), rebuilt when someone comes or goes
let cache: { key: unknown, names: string, me: string, pattern?: RegExp } | undefined;
const patternFor = (presence: readonly { name: string }[], me: string) => {
	if (cache?.key !== presence || cache.me !== me) {
		const names = presence.map(p => p.name).sort().join('\n');
		const same = cache?.names === names && cache.me === me;
		const pattern = same ? cache?.pattern : mentionPattern([...presence.map(p => p.name), me]);
		cache = {
			key: presence, names, me, pattern,
		};
	}
	return cache.pattern;
};

/** The text with each `@Name` of an online player (or yours) marked, its emoji as images. */
const withMentions = (
	split: Split, text: string, key: number, pattern: RegExp | undefined, me: string,
) => {
	if (!pattern || !text.includes('@')) return withEmoji(split, text, key);
	const out: (string | JSX.Element)[] = [];
	let last = 0;
	for (const m of text.matchAll(pattern)) {
		const at = m.index ?? 0;
		out.push(...withEmoji(split, text.slice(last, at), key * 1000 + out.length));
		const you = m[0].slice(1).toLowerCase() === me.toLowerCase();
		const cls = `chat__mention ${you ? 'is-you' : ''}`;
		out.push(<span key={`m${key}.${at}`} className={cls}>{m[0]}</span>);
		last = at + m[0].length;
	}
	out.push(...withEmoji(split, text.slice(last), key * 1000 + out.length));
	return out;
};

/** The text with each map and web address it contains clickable. */
const linked = (
	split: Split, text: string, pattern?: RegExp, me = '',
) => splitLinks(text).flatMap((part, i) => {
	if (typeof part === 'string') return withMentions(split, part, i, pattern, me);
	const open = 'map' in part
		? () => void openChatMap(part.map)
		: () => void linkFor.set(part.url);
	return <a key={i} className="chat__link" onClick={open}>{part.text}</a>;
});

/** A line's text, its `link` part opening a web platform page; `senderId`'s own emoji drawn. */
export default function ChatText({ text, link, senderId }: {
	text: string,
	link?: { label: string, path: string },
	senderId?: number,
}) {
	const [matcher] = useSynced(emoji);
	const [character] = useSynced(Entities.character);
	const split = (part: string) => matcher.split(part, senderId);
	const me = character.name ?? '';
	const pattern = useSyncedSelect(Socket.presence, presence =>
		text.includes('@') ? patternFor(presence, me) : undefined);
	const at = link ? text.indexOf(link.label) : -1;
	if (!link || at < 0) return <span className="chat__text">{linked(split, text, pattern, me)}</span>;
	const open = () => {
		void webUrl.set(link.path);
		void isWebOpen.set(true);
	};
	return (
		<span className="chat__text">
			{linked(split, text.slice(0, at), pattern, me)}
			<a className="chat__link" onClick={open}>{link.label}</a>
			{linked(split, text.slice(at + link.label.length), pattern, me)}
		</span>
	);
}
