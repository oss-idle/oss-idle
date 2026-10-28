import {
	rpc,
	unwrap,
} from './client';

/** Admin dashboard: live server + player stats, including version adoption. */
export const getAdminStats = () => unwrap(rpc.v1.stats.admin.$get());

/** Dashboard payload, inferred from the route. */
export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;

/** Every medal with its rule, holders and who already qualifies. */
export const getAdminMedals = () => unwrap(rpc.v1.medals.admin.$get());
export type AdminMedals = Awaited<ReturnType<typeof getAdminMedals>>;

/** The dashboard's last day of metrics: latency, traffic, errors, health, activity, system. */
export const getAdminMetrics = () => unwrap(rpc.v1.stats.admin.metrics.$get());
export type AdminMetrics = Awaited<ReturnType<typeof getAdminMetrics>>;

/** Paying plays and their raw strain XP per skill and play level, `days` back (all kept by default). */
export const getAdminXpGains = (days?: number) => {
	const query = days === undefined ? {} : { days: String(days) };
	return unwrap(rpc.v1.stats.admin.xp.$get({ query }));
};
export type AdminXpGains = Awaited<ReturnType<typeof getAdminXpGains>>;

/** Each skill's raw strain XP per play on its best maps, per band (osu!'s best-score weighting). */
export const getAdminXpGainBest = (min: number) =>
	unwrap(rpc.v1.stats.admin.xp.best.$get({ query: { min: String(min) } }));
export type AdminXpGainBest = Awaited<ReturnType<typeof getAdminXpGainBest>>;
