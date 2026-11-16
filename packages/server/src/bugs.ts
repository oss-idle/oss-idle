import {
	and,
	asc,
	desc,
	eq,
	inArray,
	sql,
} from 'drizzle-orm';

import {
	BUG_STATUS,
	type BugMessageBody,
	type BugReportBody,
	type BugStatus,
} from '@oss-idle/shared/bugs';

import { db } from './db/client';
import {
	bugMessages,
	bugReports,
} from './db/schema/bug_report';
import { characters } from './db/schema/character';
import { users } from './db/schema/user';
import { publish } from './discord/publish';
import {
	apiBaseUrl,
	clientUrl,
	env,
	isProd,
} from './env';
import { teamAnnounce } from './ws/chat';
import { hub } from './ws/hub';

/** A message the reporter hasn't opened the report since: one from the team. */
const unread = sql<number>`exists(
	select 1 from ${bugMessages}
	where ${bugMessages.reportId} = ${bugReports.id} and ${bugMessages.id} > ${bugReports.reporterSeen}
		and ${bugMessages.authorId} <> ${bugReports.userId}
)`.mapWith(Boolean);

/** Did someone other than the reporter write last? A bare status change doesn't count. */
const lastByTeam = sql<number>`(
	select ${bugMessages.authorId} <> ${bugReports.userId} from ${bugMessages}
	where ${bugMessages.reportId} = ${bugReports.id}
		and (${bugMessages.status} is null or ${bugMessages.body} <> '')
	order by ${bugMessages.id} desc limit 1
)`.mapWith(Boolean);

/** The character's name, or the osu! username before onboarding. */
const nameOf = sql<string | null>`coalesce(${characters.name}, ${users.username})`;

const listFields = {
	id: bugReports.id,
	title: bugReports.title,
	status: bugReports.status,
	version: bugReports.version,
	createdAt: bugReports.createdAt,
	updatedAt: bugReports.updatedAt,
	lastByTeam,
	unread,
	reporter: {
		userId: users.id, characterId: characters.id, name: nameOf,
	},
};

const list = () => db
	.select(listFields)
	.from(bugReports)
	.innerJoin(users, eq(users.id, bugReports.userId))
	.leftJoin(characters, eq(characters.id, users.currentCharacter))
	.orderBy(desc(bugReports.updatedAt));

/** `open,fixed` / `all`; none: every status but closed. */
export const bugStatuses = (filter?: string): BugStatus[] => {
	if (filter === 'all') return [...BUG_STATUS];
	const asked = filter?.split(',');
	return BUG_STATUS.filter(s => asked ? asked.includes(s) : s !== 'closed');
};

/** One account's reports, latest activity first. */
export const bugsOf = async (userId: number) => list().where(eq(bugReports.userId, userId));

/** The account's reports the team answered since the player last opened them. */
export const unreadBugs = async (userId: number) => db
	.select({
		id: bugReports.id, title: bugReports.title,
	})
	.from(bugReports)
	.where(and(eq(bugReports.userId, userId), unread));

/** Every report in these statuses, latest activity first: for the team. */
export const allBugs = async (statuses: readonly BugStatus[]) => list()
	.where(inArray(bugReports.status, [...statuses]))
	.limit(500);

export const getBug = async (id: number) => {
	const [report] = await db
		.select({
			...listFields, client: bugReports.client, setup: bugReports.setup,
		})
		.from(bugReports)
		.innerJoin(users, eq(users.id, bugReports.userId))
		.leftJoin(characters, eq(characters.id, users.currentCharacter))
		.where(eq(bugReports.id, id))
		.limit(1);
	if (!report) return undefined;

	const messages = await db
		.select({
			id: bugMessages.id,
			body: bugMessages.body,
			images: bugMessages.images,
			status: bugMessages.status,
			createdAt: bugMessages.createdAt,
			author: {
				userId: bugMessages.authorId, characterId: characters.id, name: nameOf,
			},
		})
		.from(bugMessages)
		.leftJoin(users, eq(users.id, bugMessages.authorId))
		.leftJoin(characters, eq(characters.id, users.currentCharacter))
		.where(eq(bugMessages.reportId, id))
		.orderBy(asc(bugMessages.id));

	return {
		...report,
		messages: messages.map(m => ({
			...m,
			// MariaDB's JSON is text
			images: (typeof m.images === 'string' ? JSON.parse(m.images) : m.images) as string[],
			team: m.author.userId !== report.reporter.userId,
		})),
	};
};

/** The reporter opened the report: everything in it is read. */
export const markBugSeen = async (id: number): Promise<void> => {
	await db.update(bugReports)
		.set({
			reporterSeen: sql`(
				select coalesce(max(${bugMessages.id}), 0) from ${bugMessages}
				where ${bugMessages.reportId} = ${id}
			)`,
		})
		.where(eq(bugReports.id, id));
};

const trim = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text;

/** The team hears of a player's message (#team, the Discord feed), the player of the team's. */
const notify = async (id: number, isNew: boolean): Promise<void> => {
	const bug = await getBug(id);
	const message = bug?.messages.at(-1);
	if (!bug || !message) return;

	if (message.team) {
		if (bug.reporter.characterId) {
			hub.sendTo(bug.reporter.characterId, {
				type: 'bug:reply', id, title: bug.title,
			});
		}
		return;
	}

	const url = `${clientUrl}/web/bugs/${id}`;
	const name = bug.reporter.name ?? `user ${bug.reporter.userId}`;
	const what = isNew ? 'New bug report' : 'Bug report reply';
	await teamAnnounce(`${what} from ${name}: ${bug.title} ${url}`);
	if (!isProd || !env.BUG_FEED_WEBHOOK) return;
	await publish(env.BUG_FEED_WEBHOOK, {
		embeds: [{
			title: trim(`${isNew ? 'New' : 'Reply on'} #${id}: ${bug.title}`, 256),
			url,
			description: trim(message.body, 2000),
			author: { name },
			footer: { text: bug.version },
			color: isNew ? 15548997 : 5793266,
			image: message.images[0] ? { url: `${apiBaseUrl}${message.images[0]}` } : undefined,
			timestamp: new Date().toISOString(),
		}],
	});
};

export const createBug = async (
	userId: number,
	{ body, images = [], ...report }: BugReportBody,
): Promise<number> => {
	const id = await db.transaction(async tx => {
		const [{ insertId }] = await tx.insert(bugReports).values({
			userId, ...report,
		});
		await tx.insert(bugMessages).values({
			reportId: insertId, authorId: userId, body, images,
		});
		return insertId;
	});
	await notify(id, true);
	return id;
};

export const addBugMessage = async (
	reportId: number,
	authorId: number,
	{ body, images = [], status }: BugMessageBody,
): Promise<void> => {
	await db.transaction(async tx => {
		await tx.insert(bugMessages).values({
			reportId, authorId, body, images, status,
		});
		await tx.update(bugReports)
			.set({
				updatedAt: new Date(), ...status && { status },
			})
			.where(eq(bugReports.id, reportId));
	});
	await notify(reportId, false);
};
