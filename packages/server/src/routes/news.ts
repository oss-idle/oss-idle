import {
	and,
	desc,
	eq,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
	newsCreateBody,
	newsUpdateBody,
} from '@oss-idle/shared/news';

import { requireAdmin } from '../auth/admin';
import { db } from '../db/client';
import {
	news,
	toNewsDTO,
} from '../db/schema/news';
import { users } from '../db/schema/user';
import { announceNews } from '../news/announce';
import { saveUploadedImage } from '../uploads';
import {
	idParam,
	valid,
} from '../validate';


/**
 * Post a freshly published article to the Discord news feed. The announce is
 * claimed by flipping `announced` false->true in one statement, so only one
 * cluster worker ever posts, and re-saving (or unpublishing and publishing
 * again) never posts a second time. `announce: false` on the request skips it
 * and leaves the flag down, so it can still go out on a later save.
 */
const maybeAnnounce = async (id: number, announce: boolean, authorName: string) => {
	if (!announce) return;

	const [row] = await db.select().from(news).where(eq(news.id, id)).limit(1);
	if (!row?.published || row.announced) return;

	const [claim] = await db
		.update(news)
		.set({ announced: true })
		.where(and(eq(news.id, id), eq(news.announced, false)));
	if (!claim.affectedRows) return;

	// Put the flag back if Discord refused it, so a re-save can try again.
	if (!await announceNews(row, authorName)) {
		await db.update(news).set({ announced: false }).where(eq(news.id, id));
	}
};

/** Join the author's username onto a news row and map to the DTO. */
async function withAuthor(row: typeof news.$inferSelect) {
	const [author] = await db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, row.authorId))
		.limit(1);
	return toNewsDTO(row, author?.username ?? 'unknown');
}

/**
 * News articles. Reads are public but only expose published posts; writes are
 * admin-only (see `requireAdmin`). Drafts are visible only through the `/admin`
 * endpoints. Chained so the routes land in the exported AppType.
 */
export const newsRoutes = new Hono()
	// Public: published articles, newest first.
	.get('/', async c => {
		const rows = await db
			.select()
			.from(news)
			.where(eq(news.published, true))
			.orderBy(desc(news.publishedAt));
		return c.json(await Promise.all(rows.map(withAuthor)));
	})
	.get('/latest', async c => {
		const [row] = await db
			.select()
			.from(news)
			.where(eq(news.published, true))
			.orderBy(desc(news.publishedAt))
			.limit(1)
		;
		return c.json(row ? await withAuthor(row) : null);
	})

	// Admin: every article including drafts, newest first.
	.get('/admin', requireAdmin, async c => {
		const rows = await db.select().from(news).orderBy(desc(news.createdAt));
		return c.json(await Promise.all(rows.map(withAuthor)));
	})

	// Admin: a single article by id (draft or published) for the editor.
	.get('/admin/:id', requireAdmin, async c => {
		const id = idParam.parse(c.req.param('id'));
		const [row] = await db.select().from(news).where(eq(news.id, id)).limit(1);
		if (!row) throw new HTTPException(404, { message: 'Article not found' });
		return c.json(await withAuthor(row));
	})

	// Admin: create.
	.post('/', requireAdmin, valid('json', newsCreateBody), async c => {
		const { announce, ...body } = c.req.valid('json');

		const [dupe] = await db.select({ id: news.id }).from(news).where(eq(news.slug, body.slug)).limit(1);
		if (dupe) throw new HTTPException(409, { message: 'An article with that slug already exists' });

		const [created] = await db.insert(news).values({
			...body,
			authorId: c.get('userId'),
			publishedAt: body.published ? new Date() : null,
		});
		const [row] = await db.select().from(news).where(eq(news.id, created.insertId)).limit(1);
		const dto = await withAuthor(row!);

		await maybeAnnounce(created.insertId, announce, dto.authorName);
		return c.json(dto, 201);
	})

	// Admin: update. Toggling `published` on stamps `publishedAt` the first time.
	.patch('/:id', requireAdmin, valid('json', newsUpdateBody), async c => {
		const id = idParam.parse(c.req.param('id'));
		const { announce = true, ...body } = c.req.valid('json');

		const [existing] = await db.select().from(news).where(eq(news.id, id)).limit(1);
		if (!existing) throw new HTTPException(404, { message: 'Article not found' });

		if (body.slug && body.slug !== existing.slug) {
			const [dupe] = await db.select({ id: news.id }).from(news)
				.where(and(eq(news.slug, body.slug)));
			if (dupe && dupe.id !== id) throw new HTTPException(409, { message: 'An article with that slug already exists' });
		}

		const publishedAt = body.published === undefined
			? existing.publishedAt
			: body.published
				? (existing.publishedAt ?? new Date()) // first publish stamps the date
				: null;

		await db.update(news).set({
			...body, publishedAt, 
		}).where(eq(news.id, id));
		const [row] = await db.select().from(news).where(eq(news.id, id)).limit(1);
		const dto = await withAuthor(row!);

		await maybeAnnounce(id, announce, dto.authorName);
		return c.json(dto);
	})

	// Admin: delete.
	.delete('/:id', requireAdmin, async c => {
		const id = idParam.parse(c.req.param('id'));
		const [deleted] = await db.delete(news).where(eq(news.id, id));
		if (!deleted.affectedRows) throw new HTTPException(404, { message: 'Article not found' });
		return c.json({ ok: true });
	})

	// Admin: upload a cover image; returns the public path to store as imageUrl.
	.post('/image', requireAdmin, async c => {
		const body = await c.req.parseBody();
		return c.json({ url: await saveUploadedImage(body['file']) });
	})

	// Public: a single published article by slug. Kept last so the static
	// `/admin` paths above aren't shadowed by this `:slug` catch-all.
	.get('/:slug', async c => {
		const slug = c.req.param('slug');
		const [row] = await db
			.select()
			.from(news)
			.where(and(eq(news.slug, slug), eq(news.published, true)))
			.limit(1);
		if (!row) throw new HTTPException(404, { message: 'Article not found' });
		return c.json(await withAuthor(row));
	});
