import { ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import {
	ANNOUNCE_CHANNEL,
	type ChatLine,
} from '@oss-idle/shared/community/wire';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import useSyncedSelect from '@oss-idle/shared/hooks/useSyncedSelect';

import { music } from '../../../audio/MusicPlayer';
import Entities from '../../../entity/entities';
import { SITE_URL } from '../../../globals';
import {
	type LogEntry,
	logLines,
	LOGS_CHANNEL,
} from '../../../logs';
import Auth from '../../../online/auth';
import { blocked } from '../../../online/blocks';
import { emojiSrc } from '../../../online/emoji';
import {
	conversations,
	sendPm,
} from '../../../online/privateMessages';
import Socket from '../../../online/socket';
import ChatLogLine, { type LogLine } from './ChatLogLine';
import { mapLink } from './links';
import {
	MENTION_COLOR,
	mentionsMe,
} from './mentions';
import MentionSuggestions from './MentionSuggestions';
import ReplyBar from './ReplyBar';
import {
	chatTabs,
	pmContact,
} from './state';
import useEmojiSuggest from './useEmojiSuggest';
import useNameComplete from './useNameComplete';
import useReply from './useReply';

/** How a channel line shows to you: `me` sees their mentions lit, blocked players' lines hidden. */
const toLogLine = (l: LogEntry, blockedIds: ReadonlySet<number>, me?: number): LogLine => {
	if (l.kind === 'system') return {
		id: l.id, at: l.at, text: l.text, color: l.color, name: l.name, link: l.link, parts: l.parts, ruleset: l.ruleset,
		sender: l.from && l.name !== undefined ? {
			...l.from, name: l.name,
		} : undefined,
	};
	// a blocked player's line, with not even their name
	if (blockedIds.has(l.from.userId)) return {
		id: l.id, at: l.at, text: '<block>',
	};
	return {
		id: l.id, at: l.at, text: l.text, name: l.from.name, fromId: l.from.userId, fromColor: l.from.color,
		reactions: l.reactions,
		color: mentionsMe(l.text) && l.from.userId !== me ? MENTION_COLOR : l.from.color,
		replyTo: l.replyTo,
		sender: {
			...l.from, line: l,
		},
	};
};

export default function ChatTabContents({ channel, inputRef } : {
	channel: string,
	inputRef: RefObject<HTMLInputElement>,
}) {
	const contact = pmContact(channel);
	const [lines = []] = useSynced(channel === LOGS_CHANNEL ? logLines : Socket.chat);
	const [pms = new Map()] = useSynced(conversations);
	const [blockedIds = new Set<number>()] = useSynced(blocked);
	const [draft, setDraft] = useState('');
	const logRef = useRef<HTMLDivElement>(null);
	const atBottom = useRef(true);
	const emoji = useEmojiSuggest(draft, setDraft, inputRef);
	const [user] = useSynced(Auth.user);
	const me = user?.id;
	const myName = useSyncedSelect(Entities.character, c => c.name);

	// one view per line, kept while the line is unchanged, so only new or changed rows render
	const views = useMemo(() => new WeakMap<ChatLine, LogLine>(), [blockedIds, me, myName]);
	const shown: LogLine[] = useMemo(() => contact === undefined
		? lines.filter(l => l.channel === channel).map(l => {
			let view = views.get(l);
			if (!view) views.set(l, view = toLogLine(l, blockedIds, me));
			return view;
		})
		: (pms.get(contact) ?? []), [lines, pms, views, channel, contact]);
	const names = useNameComplete(draft, setDraft, inputRef, shown);
	const reply = useReply(shown, logRef, inputRef);

	useEffect(() => {
		const el = logRef.current;
		if (el && atBottom.current) el.scrollTop = el.scrollHeight;
	}, [shown[shown.length - 1]?.id]);

	const handleCommand = (text: string) => {
		if (text === '/np') {
			const np = music.beatmap.get();
			if (!np) return 'Nothing is playing';
			const { artist, title } = np.set.metadata;
			return mapLink(SITE_URL, {
				setId: np.set.metadata.id, beatmapId: np.metadata.id,
			}, `${artist} - ${title} [${np.metadata.version}]`);
		}
		return text;
	};

	// emoji first (their list takes Tab while it's open), then player names: the @ list or Tab's cycle
	const complete = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!emoji.onKeyDown(e) && !names.onKeyDown(e)) reply.onKeyDown(e);
	};

	const submit = (e: React.FormEvent) => {
		e.preventDefault();
		const text = draft.trim();
		if (!text || !chatTabs.get()?.includes(channel)) return;
		if (contact === undefined) {
			const out = reply.send(handleCommand(text));
			Socket.sendChat(out.text, channel, out.replyTo);
		} else sendPm(contact, handleCommand(text));
		setDraft('');
		atBottom.current = true;
	};

	return (<>
		<div
			className="chat__log" ref={logRef}
			onScroll={e => {
				const el = e.currentTarget;
				atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
			}}
		>
			{shown.map(line => (
				<ChatLogLine
					key={line.id} line={line} channel={channel} actions={contact === undefined}
					there={!!line.replyTo && reply.inLog(line.replyTo.id)}
					onReply={reply.start} onJump={reply.jump}
				/>
			))}
		</div>

		{channel !== LOGS_CHANNEL && channel !== ANNOUNCE_CHANNEL && (
			<form className="chat__compose" onSubmit={submit}>
				<ReplyBar
					target={reply.target}
					onCancel={reply.cancel}
					inputRef={inputRef}
					draft={draft}
				/>
				<MentionSuggestions mention={names} inputRef={inputRef} draft={draft} />
				{emoji.query && emoji.suggestions.length > 0 && (
					<div className="chat__emoji">
						<div className="chat__emoji-title">
							<Trans>Emoji matching <b>:{ph({ query: emoji.query })}</b></Trans>
						</div>
						{emoji.suggestions.map((s, i) => (
							<button
								key={s.name}
								type="button"
								className={`chat__emoji-option ${i === emoji.picked ? 'is-picked' : ''}`}
								onMouseEnter={() => emoji.setPicked(i)}
								onMouseDown={e => e.preventDefault()}
								onClick={() => emoji.insert(s)}
							>
								<img className="chat__emoji-img" src={emojiSrc(s.id)} alt="" />
								:{s.name}:
							</button>
						))}
					</div>
				)}
				<span>
					{'>'}
				</span>
				<input
					ref={inputRef}
					type="text"
					value={draft}
					onChange={e => {
						names.typed();
						setDraft(e.target.value);
					}}
					onKeyDown={complete}
				/>
			</form>
		)}
	</>);
}
