import { Hono } from 'hono';

import { db } from '../db/client';
import {
	getOnline,
	getPlaying,
} from '../play';
import { enabledRulesets } from '../rulesets/registry';

/** Plays stored, every ruleset's. */
const scoreCount = async () => (await Promise.all(enabledRulesets().map(async ({ score }) =>
	(await db.select({ nb: max(score.id) }).from(score))[0].nb ?? 0))).reduce((a, b) => a + b, 0);
import { max } from 'drizzle-orm';
import { z } from 'zod';

import { RULESET_IDS } from '@oss-idle/shared/rulesets/ids';
import { VERSION } from '@oss-idle/shared/version';

import { requireAdmin } from '../auth/admin';
import { dashboard } from '../dashboard';
import { characters } from '../db/schema/character';
import {
	xpGainBest,
	xpGainTotals,
} from '../db/schema/xp_gain';
import {
	apiBaseUrl,
	env,
} from '../env';
import {
	clientIp,
	continentOf,
} from '../geo';
import {
	guestCount,
	guestTotal,
	seeGuest,
} from '../guests';
import { timing } from '../metrics';
import { clientCount } from '../queue';
import { rateLimit } from '../rateLimit';
import { rulesetQuery } from '../rulesets/request';
import { sim } from '../sim';
import { getStats } from '../stats';
import { valid } from '../validate';
import {
	adoptionBreakdown,
	presenceCount,
} from '../ws/presence';

/** The API origins players can be on: the API itself and its edges. */
const apiHosts = () => [apiBaseUrl, ...env.API_EDGES].map(url => new URL(url).host);

/** The admin XP gains view: a ruleset, and how many days back from today (all kept by default). */
const xpGainsQuery = z.object({
	ruleset: z.enum(RULESET_IDS).optional(),
	days: z.coerce.number().int().min(1).max(3650).optional(),
});

const xpGainBestQuery = z.object({
	ruleset: z.enum(RULESET_IDS).optional(),
	min: z.coerce.number().int().min(1).max(100_000).default(3),
});

/** Round trips the game measured to each origin while picking the nearest. */
const rttBody = z.object({
	samples: z.array(z.object({
		host: z.string().max(100),
		ms: z.number().min(0).max(60_000),
	})).max(8),
});

const guestBody = z.object({ id: z.uuid() });

export const statsRoutes = new Hono()
	.get('/general', async c => c.json({
		playing: await getPlaying(),
		online: await getOnline(),
		scores: await scoreCount(),
		users: (await db.select({ nb: max(characters.id) }).from(characters))[0].nb ?? 0,
	}))
	.get('/recent', async c => c.json(await getStats()))
	.get('/version', async c => c.json(VERSION))
	.get('/admin', requireAdmin, async c => c.json({
		serverVersion: VERSION,
		sim: {
			name: sim().name, version: sim().version,
		},
		online: await presenceCount(),
		clients: await clientCount(),
		playing: await getPlaying(),
		players: (await db.select({ nb: max(characters.id) }).from(characters))[0].nb ?? 0,
		guests: await guestCount(),
		guestsTotal: await guestTotal(),
		scores: await scoreCount(),
		adoption: await adoptionBreakdown(),
	}))
	.get('/admin/metrics', requireAdmin, async c => c.json(await dashboard(apiHosts())))
	.get('/admin/xp', requireAdmin, valid('query', xpGainsQuery), async c => {
		const r = rulesetQuery(c);
		const { days } = c.req.valid('query');
		const since = days === undefined
			? undefined
			: new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
		return c.json({
			skills: r.def.skills, rows: await xpGainTotals(r, since), 
		});
	})
	// each skill's pay per band on its best maps, weighted like osu!'s best scores
	.get('/admin/xp/best', requireAdmin, valid('query', xpGainBestQuery), async c => {
		const r = rulesetQuery(c);
		return c.json({
			skills: r.def.skills, cells: await xpGainBest(r, c.req.valid('query').min, 100),
		});
	})
	.post('/rtt', rateLimit('rtt', 20), valid('json', rttBody), async c => {
		const hosts = apiHosts();
		const continent = await continentOf(clientIp(c)) ?? '??';
		for (const { host, ms } of c.req.valid('json').samples) {
			if (hosts.includes(host)) timing(`rtt:${host}`, ms, `${continent}:`);
		}
		return c.body(null, 204);
	})
	.post('/guest', rateLimit('guest', 5), valid('json', guestBody), async c => {
		await seeGuest(c.req.valid('json').id);
		return c.body(null, 204);
	})
;