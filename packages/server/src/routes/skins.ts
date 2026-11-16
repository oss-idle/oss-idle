import {
	and,
	desc,
	eq,
	or,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import {
	SKIN_STATUS,
	skinCreateBody,
	skinModerateBody,
	skinUpdateBody,
} from '@oss-idle/shared/skin';

import { requireActive } from '../auth/active';
import { requireAdmin } from '../auth/admin';
import { requireAuth } from '../auth/middleware';
import {
	browseQuery,
	countDownload,
	owned,
	withAuthor,
} from '../authored';
import { db } from '../db/client';
import { csv } from '../db/columns';
import {
	skinDownloads,
	skinFiles,
	type SkinRow,
	skins,
	toSkinDTO,
} from '../db/schema/skin';
import { users } from '../db/schema/user';
import { dailyLimit } from '../rateLimit';
import {
	dropUnused,
	SkinRefused,
	storeOsk,
} from '../skins/storage';
import { saveUploadedImage } from '../uploads';
import {
	idParam,
	valid,
} from '../validate';

// skins publish without review: publishes and icon uploads are capped per account
const SKINS_PER_DAY = 5;
const SKIN_UPLOADS_PER_DAY = 20;

const filesOf = (id: number) => db
	.select({
		path: skinFiles.path, hash: skinFiles.hash, size: skinFiles.size,
	})
	.from(skinFiles)
	.where(eq(skinFiles.skinId, id));

/** A skin with its files, for viewing and installing it. */
const withFiles = async (row: SkinRow) => ({
	...await withAuthor(row, toSkinDTO),
	files: await filesOf(row.id),
});

const ownedBy = async (id: number, userId: number) => {
	const [row] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
	return owned(row, userId, 'Skin');
};

export const skinsRoutes = new Hono()
	.get('/', async c => {
		const { where, orderBy } = browseQuery(c, skins);
		const rows = await db
			.select()
			.from(skins)
			.innerJoin(users, eq(users.id, skins.authorId))
			.where(and(eq(skins.status, SKIN_STATUS.PUBLISHED), ...where))
			.orderBy(orderBy);
		return c.json(rows.map(r => toSkinDTO(r.skin, r.user.username)));
	})

	.get('/me', requireAuth, async c => {
		const rows = await db.select().from(skins)
			.where(eq(skins.authorId, c.get('userId')))
			.orderBy(desc(skins.updatedAt));
		return c.json(await Promise.all(rows.map(r => withAuthor(r, toSkinDTO))));
	})

	.post('/', requireActive, valid('json', skinCreateBody), async c => {
		const body = c.req.valid('json');
		const [created] = await db.insert(skins).values({
			name: body.name,
			description: body.description,
			tags: csv(body.tags),
			version: body.version,
			icon: body.icon,
			authorId: c.get('userId'),
		});
		const [row] = await db.select().from(skins).where(eq(skins.id, created.insertId)).limit(1);
		return c.json(await withAuthor(row!, toSkinDTO), 201);
	})

	.post('/icon', requireActive, dailyLimit('skin-icons', SKIN_UPLOADS_PER_DAY), async c => {
		const body = await c.req.parseBody();
		return c.json({ url: await saveUploadedImage(body['file']) });
	})

	.get('/admin', requireAdmin, async c => {
		const rows = await db.select().from(skins)
			.where(or(
				eq(skins.status, SKIN_STATUS.PUBLISHED),
			))
			.orderBy(desc(skins.updatedAt));
		return c.json(await Promise.all(rows.map(r => withAuthor(r, toSkinDTO))));
	})
	
	.patch('/admin/:id', requireAdmin, valid('json', skinModerateBody), async c => {
		const id = idParam.parse(c.req.param('id'));
		const { status } = c.req.valid('json');
	
		const [existing] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
		if (!existing) throw new HTTPException(404, { message: 'Skin not found' });
	
		const publishedAt = status === SKIN_STATUS.PUBLISHED
			? (existing.publishedAt ?? new Date())
			: existing.publishedAt;
	
		await db.update(skins).set({
			status, publishedAt,
		}).where(eq(skins.id, id));
		const [row] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
		return c.json(await withAuthor(row!, toSkinDTO));
	})

	.post('/:id/submit', requireActive, dailyLimit('skins', SKINS_PER_DAY), async c => {
		const id = idParam.parse(c.req.param('id'));
		const existing = await ownedBy(id, c.get('userId'));
		if (existing.status === SKIN_STATUS.PUBLISHED) {
			throw new HTTPException(409, { message: 'Skin already published' });
		}
		await db.update(skins).set({
			status: SKIN_STATUS.PUBLISHED, publishedAt: existing.publishedAt ?? new Date(),
		}).where(eq(skins.id, id));
		const [row] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
		return c.json(await withAuthor(row!, toSkinDTO));
	})

	// Auth: record that the caller installed this skin. Deduped per player by the
	// unique key, so the counter only moves on a player's first install.
	.post('/:id/download', requireAuth, async c => {
		const id = idParam.parse(c.req.param('id'));
		const [pub] = await db.select({ id: skins.id }).from(skins)
			.where(and(eq(skins.id, id), eq(skins.status, SKIN_STATUS.PUBLISHED)))
			.limit(1);
		if (!pub) throw new HTTPException(404, { message: 'Skin not found' });

		const inserted = await db.insert(skinDownloads).ignore().values({
			skinId: id, userId: c.get('userId'),
		});
		return c.json(await countDownload(skins, id, inserted));
	})

	.patch('/:id', requireActive, valid('json', skinUpdateBody), async c => {
		const id = idParam.parse(c.req.param('id'));
		const body = c.req.valid('json');
		const existing = await ownedBy(id, c.get('userId'));

		await db.update(skins).set({
			...body,
			tags: body.tags ? csv(body.tags) : undefined,
			status: existing.status,
		}).where(eq(skins.id, id));
		const [row] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
		return c.json(await withAuthor(row!, toSkinDTO));
	})

	// Owner: replace the skin's files with an .osk's
	.put('/:id/files', requireActive, dailyLimit('skin-files', SKIN_UPLOADS_PER_DAY), async c => {
		const id = idParam.parse(c.req.param('id'));
		await ownedBy(id, c.get('userId'));
		const file = (await c.req.parseBody())['file'];
		if (!(file instanceof File)) throw new HTTPException(400, { message: 'No .osk file provided' });
		let files;
		try {
			files = await storeOsk(Buffer.from(await file.arrayBuffer()));
		} catch (e) {
			if (e instanceof SkinRefused) throw new HTTPException(422, { message: e.message });
			throw e;
		}
		const before = await filesOf(id);
		await db.transaction(async tx => {
			await tx.delete(skinFiles).where(eq(skinFiles.skinId, id));
			for (let i = 0; i < files.length; i += 500) {
				await tx.insert(skinFiles).values(files.slice(i, i + 500).map(f => ({
					...f, skinId: id,
				})));
			}
			await tx.update(skins).set({
				size: files.reduce((total, f) => total + f.size, 0),
				fileCount: files.length,
			}).where(eq(skins.id, id));
		});
		await dropUnused(before);
		const [row] = await db.select().from(skins).where(eq(skins.id, id)).limit(1);
		return c.json(await withFiles(row!));
	})

	.delete('/:id', requireAuth, async c => {
		const id = idParam.parse(c.req.param('id'));
		await ownedBy(id, c.get('userId'));
		const before = await filesOf(id);
		await db.delete(skins).where(eq(skins.id, id));
		await dropUnused(before);
		return c.json({ ok: true });
	})

	.get('/:id', requireAuth, async c => {
		const id = idParam.parse(c.req.param('id'));
		const [row] = await db.select().from(skins)
			.where(
				and(
					eq(skins.id, id),
					or(
						eq(skins.status, SKIN_STATUS.PUBLISHED),
						eq(skins.authorId, c.get('userId')), 
					),
				),
			)
			.limit(1);
		if (!row) throw new HTTPException(404, { message: 'Skin not found' });
		return c.json(await withFiles(row));
	});
