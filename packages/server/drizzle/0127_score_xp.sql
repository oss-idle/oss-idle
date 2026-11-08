-- XP a ranked play earned per skill, so song select shows it on every device. By hand like 0038+.
CREATE TABLE IF NOT EXISTS `mania4k_score_xp` (
	`score_id` int NOT NULL,
	`gains` json NOT NULL,
	CONSTRAINT `mania4k_score_xp_score_id` PRIMARY KEY(`score_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mania7k_score_xp` (
	`score_id` int NOT NULL,
	`gains` json NOT NULL,
	CONSTRAINT `mania7k_score_xp_score_id` PRIMARY KEY(`score_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `osu_score_xp` (
	`score_id` int NOT NULL,
	`gains` json NOT NULL,
	CONSTRAINT `osu_score_xp_score_id` PRIMARY KEY(`score_id`)
);
