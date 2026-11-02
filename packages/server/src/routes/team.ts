import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { GROUPS } from '@oss-idle/shared/groups';
import {
	NOMINATED_RULESETS,
	RULESET_IDS,
} from '@oss-idle/shared/rulesets/ids';

import { requireAdmin } from '../auth/admin';
import { getUserById } from '../db/schema/user';
import {
	addToGroup,
	removeFromGroup,
	setNominates,
	teamMembers,
} from '../groups';
import {
	idParam,
	valid,
} from '../validate';

const group = z.enum(GROUPS);
const nominated = z.enum(RULESET_IDS).refine(id => NOMINATED_RULESETS.includes(id));

/** Admin: the team's groups and their members. The owner is always an admin. */
export const teamRoutes = new Hono()
	.get('/', requireAdmin, async c => {
		const members = (await teamMembers()).map(m => ({
			...m,
			characterId: m.characterId ?? undefined,
			name: m.name ?? undefined,
			since: m.since.getTime(),
		}));
		return c.json({ members });
	})

	.put('/:group/:userId', requireAdmin, async c => {
		const userId = idParam.parse(c.req.param('userId'));
		if (!await getUserById(userId)) throw new HTTPException(404, { message: 'User not found' });
		await addToGroup(userId, group.parse(c.req.param('group')));
		return c.json({ ok: true });
	})

	// the rulesets a Beatmap Nominator ranks maps in
	.put('/bn/:userId/rulesets', requireAdmin,
		valid('json', z.object({ rulesets: z.array(nominated) })), async c => {
			const userId = idParam.parse(c.req.param('userId'));
			await setNominates(userId, [...new Set(c.req.valid('json').rulesets)]);
			return c.json({ ok: true });
		})

	.delete('/:group/:userId', requireAdmin, async c => {
		await removeFromGroup(idParam.parse(c.req.param('userId')), group.parse(c.req.param('group')));
		return c.json({ ok: true });
	});
