-- Paying plays' raw strain XP per map, skill and band, for the admin XP gains view's maps. By hand like 0038+.
CREATE TABLE IF NOT EXISTS `mania4k_xp_gain_map` (
	`beatmap_id` int NOT NULL,
	`skill` varchar(32) NOT NULL,
	`band` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `mania4k_xp_gain_map_beatmap_id_skill_band_pk` PRIMARY KEY(`beatmap_id`,`skill`,`band`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mania7k_xp_gain_map` (
	`beatmap_id` int NOT NULL,
	`skill` varchar(32) NOT NULL,
	`band` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `mania7k_xp_gain_map_beatmap_id_skill_band_pk` PRIMARY KEY(`beatmap_id`,`skill`,`band`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `osu_xp_gain_map` (
	`beatmap_id` int NOT NULL,
	`skill` varchar(32) NOT NULL,
	`band` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `osu_xp_gain_map_beatmap_id_skill_band_pk` PRIMARY KEY(`beatmap_id`,`skill`,`band`)
);
