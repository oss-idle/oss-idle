import 'dotenv/config';

import { z } from 'zod';

/**
 * Validated runtime configuration. Parsed once at boot; a missing or malformed
 * variable aborts startup with a readable error instead of failing deep inside
 * a request later.
 */
const schema = z.object({
	NODE_ENV: z.enum(['development', 'production']).default('development'),
	// Dev and prod must never share a port - otherwise a running prod (systemd)
	// service holds the port a local `npm run dev` needs. Resolved per-env below.
	PORT: z.coerce.number().int().positive().default(3873),
	PORT_PROD: z.coerce.number().int().positive().default(3875),
	// Where the API listens: every interface unless set (127.0.0.1 behind a proxy on
	// a host whose firewall lets everything in).
	LISTEN_HOST: z.string().min(1).optional(),
	// Client origin, per-env (resolved below) - used for CORS and the OAuth
	// redirect. Dev and prod differ, but share one .env, so both are declared.
	CLIENT_URL: z.url().default('http://localhost:5173'),
	CLIENT_URL_PROD: z.url().default('https://oss.idle.rhythmgamers.net'),
	// Dev only: where browsers reach this API, when not localhost - e.g. the LAN
	// staging, which proxies /v1 through the game's dev server.
	API_URL: z.url().optional(),

	DB_HOST: z.string().min(1),
	DB_PORT: z.coerce.number().int().positive().default(3306),
	DB_USER: z.string().min(1),
	DB_PASSWORD: z.string(),
	DB_NAME: z.string().min(1).default('idle'),
	DB_NAME_DEV: z.string().min(1).default('idle_test'),
	// The farm's `stats` database, read-only: it mirrors every ranked/loved
	// beatmap and backs the map-request search box. Same credentials; its host is
	// DB_HOST unless prod runs away from the farm (STATS_DB_HOST, over WireGuard).
	STATS_DB_NAME: z.string().min(1).default('stats'),
	STATS_DB_HOST: z.string().min(1).optional(),

	// osu! OAuth application (https://osu.ppy.sh/home/account/edit → OAuth)
	OSU_CLIENT_ID: z.string().min(1),
	OSU_CLIENT_SECRET: z.string().min(1),

	// The osu! API scheduler (https://github.com/Adrriii/osu-api-scheduler): every
	// osu! API call goes through it so the host's single per-IP rate budget is
	// shared across projects. Nothing here talks to osu.ppy.sh/api directly.
	OSU_API_URL: z.url().default('https://osu.api.rhythmgamers.net'),
	OSU_SCHEDULER_TOKEN: z.string().min(1),
	// Another scheduler (its own token) for when that one can't be reached.
	OSU_API_FALLBACK_URL: z.url().optional(),
	OSU_SCHEDULER_FALLBACK_TOKEN: z.string().min(1).optional(),

	// Where an accepted request's .osz is pulled from when ingesting it straight
	// from the queue. `{setId}` is substituted; osu! itself has no download API
	// for an app token, so this is a mirror.
	BEATMAP_MIRROR_URL: z.string().min(1).default('https://catboy.best/d/{setId}'),

	// Secret for signing our own session + CSRF-state JWTs.
	JWT_SECRET: z.string().min(1),

	// Bearer token of the repo add-on builder (scripts/addon-builder.mts). Unset, nothing builds.
	ADDON_BUILD_SECRET: z.string().min(32).optional(),

	// The sim services (simService.ts) that play the sim API's requests, comma-separated in
	// order of preference (simHosts.ts), and the bearer they take. Unset, this server plays
	// them itself - never on prod.
	SIM_SERVICE_URL: z.string().default('')
		.transform(s => s.split(',').map(url => url.trim().replace(/\/$/, '')).filter(Boolean))
		.pipe(z.array(z.url())),
	SIM_SERVICE_SECRET: z.string().min(32).optional(),

	// Redis holds the cross-process play state (pending plays, online/playing
	// presence, session strain) so the API can run as a pm2 cluster. Defaults
	// target a local redis-server; dev and prod are isolated by logical DB below.
	REDIS_HOST: z.string().min(1).default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().positive().default(6379),
	REDIS_PASSWORD: z.string().optional(),
	REDIS_DB: z.coerce.number().int().min(0).default(0),
	
	MAP_FEED_WEBHOOK: z.string(),
	/** Self-assigned Discord roles pinged with each ranked / loved map. */
	MAP_FEED_ROLE_ID: z.string().optional(),
	MAP_FEED_LOVED_ROLE_ID: z.string().optional(),
	NEWS_FEED_WEBHOOK: z.string(),
	USER_FEED_WEBHOOK: z.string(),
	ERROR_FEED_WEBHOOK: z.string(),
	/** new bug reports and players' replies, for the team (prod only) */
	BUG_FEED_WEBHOOK: z.string().optional(),

	// The oss!idle Discord app: OAuth links a player's Discord account so the bot
	// (packages/discord) can give them their level role. No secret, no linking.
	DISCORD_CLIENT_ID: z.string().min(1).default('1517803750968918037'),
	DISCORD_CLIENT_SECRET: z.string().optional(),

	// Bytes/s a supporter's "download every ranked beatmap" gets, so one bulk
	// download can't take the uplink from players. Tune to the host's upload.
	BULK_DOWNLOAD_RATE: z.coerce.number().int().positive().default(100_000_000 / 8), // 100 Mbps
	// Bytes/s for a non-supporter's .osz past their daily full-speed ones (beatmaps/fastDownloads.ts).
	SLOW_DOWNLOAD_RATE: z.coerce.number().int().positive().default(2_000_000 / 8), // 2 Mbps

	// API edges nearer some players (the game picks by latency: VITE_API_EDGES); the
	// dashboard checks them every minute.
	API_EDGES: z.string().default('')
		.transform(s => s.split(',').map(url => url.trim().replace(/\/$/, '')).filter(Boolean)),

	// MaxMind GeoLite2-City database, used to place online players on the world
	// map (anonymous, coarse) and derive their timezone. Optional: without it the
	// map/timezone features degrade to country-level. The file is provisioned out
	// of band (download + periodic refresh from MaxMind).
	GEOIP_DB: z.string().optional(),

	// Stripe, for supporter tags (test keys on dev). The webhook secret comes
	// from the dashboard endpoint on prod, from `stripe listen` on dev.
	STRIPE_SECRET_KEY: z.string().optional(),
	STRIPE_WEBHOOK_SECRET: z.string().optional(),
	// Abby (Intégrations → clé API): prod books each supporter order in its livre des recettes.
	ABBY_API_KEY: z.string().optional(),
	// Supporter thank-you emails go out through this mailbox, e.g. smtps://user:pass@mail.boitech.dev:465.
	SMTP_URL: z.string().optional(),
	// itch.io: the OAuth app players sign in with to claim a donation as supporter (prod
	// callback only), the oss!idle page's id, and an API key of its owner's to read the
	// purchases. No key, no claims.
	ITCH_CLIENT_ID: z.string().min(1).default('45634dc44fbd5fa3a0874a8958f562b2'),
	ITCH_GAME_ID: z.coerce.number().int().default(5220711),
	ITCH_API_KEY: z.string().optional(),
	// What the server costs a month in euros
	SERVER_MONTHLY_COST: z.coerce.number().positive().optional(),
	SUPPORTER_TAXES: z.string().default('')
		.transform(s => s.split(',').filter(Boolean).map(Number)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
	console.error('❌ Invalid environment configuration:');
	console.error(parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';

/**
 * Listening port, resolved per-environment so dev (3873) and prod (3875) never
 * collide - the prod systemd service and a local `npm run dev` can run side by
 * side. The reverse proxy for api.oss.idle.rhythmgamers.net targets the prod port.
 */
export const port = isProd ? env.PORT_PROD : env.PORT;

/**
 * The client app origin, resolved per-environment so a single shared `.env` can't
 * leave prod trusting the dev (localhost) origin - which would break CORS and the
 * OAuth redirect for the live site.
 */
export const clientUrl = isProd ? env.CLIENT_URL_PROD : env.CLIENT_URL;

/**
 * Database name, resolved from environment: the dev database (`dev`) everywhere
 * except production, where the real `DB_NAME` is used. Keeps prod data from ever
 * being touched by a dev/test run that forgot to set NODE_ENV.
 */
export const dbName = isProd ? env.DB_NAME : env.DB_NAME_DEV;

/**
 * This Redis is shared with many other projects on the host, so isolation comes
 * from {@link redisKeyPrefix} - every key this app touches is namespaced (a bare
 * `pending:<id>` could collide with another project, and a logical DB index is no
 * defence: there are only 16, nobody coordinates them, and most tooling assumes
 * db 0). The per-env prefix also keeps a local dev run apart from prod. The DB
 * index stays configurable (default 0) only in case the host has its own
 * per-project DB convention to slot into.
 */
export const redisDb = env.REDIS_DB;
export const redisKeyPrefix = isProd ? 'oss-idle:prod:' : 'oss-idle:dev:';

/**
 * Public origin of this API. Fixed in prod; in dev localhost unless API_URL says
 * otherwise. Used to build the osu! OAuth redirect URI, which must exactly match
 * a registered callback.
 */
export const apiBaseUrl = isProd
	? 'https://api.oss.idle.rhythmgamers.net'
	: env.API_URL ?? `http://localhost:${port}`;

/** osu! OAuth callback (both dev + prod variants are registered on the app). */
export const OSU_REDIRECT_URI = `${apiBaseUrl}/v1/auth/osu/callback`;

/** Discord OAuth callback (both dev + prod variants are registered on the app). */
export const DISCORD_REDIRECT_URI = `${apiBaseUrl}/v1/auth/discord/callback`;

/** itch.io OAuth callback, registered on the itch.io app. */
export const ITCH_REDIRECT_URI = `${apiBaseUrl}/v1/store/itch/callback`;

/** The prod site before the rename to oss!idle. Old links and desktop builds still
 *  reach it, and its pages hand their data over from there (shared/src/hostMove.ts). */
export const LEGACY_CLIENT_URL = 'https://osu.idle.rhythmgamers.net';

/** Origin the desktop renderer reports (it loads its bundle from a registered
 *  `app://` scheme). Allowed through CORS so the Bearer-authed app can call us. */
export const DESKTOP_ORIGIN = 'app://idle';

/** Session cookie is Secure only over https (prod). */
export const cookieSecure = isProd;

/** The session cookie covers every oss!idle host (the API and its edges, like
 *  na.oss.idle) in prod; the old osu.idle hosts can't set it, so theirs stay their own. */
export const SESSION_COOKIE_DOMAIN = 'oss.idle.rhythmgamers.net';
