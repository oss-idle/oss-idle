import { faReply } from '@fortawesome/free-solid-svg-icons/faReply';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { t } from '@lingui/core/macro';
import { memo } from 'react';

import type { Reactions as LineReactions } from '@oss-idle/shared/community/reactions';
import type { ReplyQuote } from '@oss-idle/shared/community/wire';
import clock from '@oss-idle/shared/display/clock';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	type LogPart,
	partColor,
} from '../../../logMarks';
import type { MenuTarget } from '../state';
import ChatText from './ChatText';
import Reactions from './Reactions';
import ReactPicker from './ReactPicker';
import ReplyRef from './ReplyRef';
import RulesetTag from './RulesetTag';
import SenderName from './SenderName';

/** A line as the log renders it; no `name` = a system line, coloured whole. */
export type LogLine = {
	id: string,
	at: number,
	text: string,
	color?: string,
	/** a #logs line's coloured pieces */
	parts?: LogPart[],
	/** the ruleset an announcement is about */
	ruleset?: RulesetId,
	name?: string,
	fromId?: number,
	fromColor?: string,
	link?: { label: string, path: string },
	sender?: MenuTarget,
	replyTo?: ReplyQuote,
	reactions?: LineReactions,
};

/** One line of the log; renders again only when its own props change. `there`: the line it answers is in the log. */
export default memo(function ChatLogLine({ line, channel, actions, there, onReply, onJump }: {
	line: LogLine,
	channel: string,
	actions: boolean,
	there: boolean,
	onReply: (line: LogLine) => void,
	onJump: (id: string) => void,
}) {
	const time = clock(line.at);

	if (line.name === undefined) {
		return (
			<div className="chat__line chat__line--system">
				<span className="chat__text" style={{ color: line.color }}>
					{time} {line.ruleset && <RulesetTag ruleset={line.ruleset} />}{line.parts
						? line.parts.map((part, i) => <span key={i} style={{ color: partColor(part) }}>{part.text}</span>)
						: line.text}
				</span>
			</div>
		);
	}

	return (
		<div className="chat__line" data-line={line.id}>
			<ReplyRef to={line.replyTo} there={there} onJump={onJump} />
			<span className="chat__from" style={{ color: line.color }}>
				{`${time} `}
				<SenderName sender={line.sender} name={line.name} color={line.color} />:
			</span>
			<span className="chat__body">
				<ChatText text={line.text} link={line.link} senderId={line.fromId} />
				<Reactions channel={channel} id={line.id} reactions={line.reactions} />
			</span>
			{actions && line.fromId !== undefined && line.text !== '<deleted>' && (
				<span className="chat__line-actions">
					<button
						type="button" className="chat__line-btn" aria-label={t`Reply`}
						onClick={() => onReply(line)}
					><FontAwesomeIcon icon={faReply} /></button>
					<ReactPicker channel={channel} id={line.id} />
				</span>
			)}
		</div>
	);
});
