-- Paying plays' raw strain XP per day, skill and the level the skill played at, for the admin XP gains view. By hand like 0038+.
CREATE TABLE IF NOT EXISTS `mania4k_xp_gain` (
	`day` date NOT NULL,
	`skill` varchar(32) NOT NULL,
	`level` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `mania4k_xp_gain_day_skill_level_pk` PRIMARY KEY(`day`,`skill`,`level`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mania7k_xp_gain` (
	`day` date NOT NULL,
	`skill` varchar(32) NOT NULL,
	`level` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `mania7k_xp_gain_day_skill_level_pk` PRIMARY KEY(`day`,`skill`,`level`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `osu_xp_gain` (
	`day` date NOT NULL,
	`skill` varchar(32) NOT NULL,
	`level` smallint NOT NULL,
	`plays` int NOT NULL,
	`xp` double NOT NULL,
	CONSTRAINT `osu_xp_gain_day_skill_level_pk` PRIMARY KEY(`day`,`skill`,`level`)
);
