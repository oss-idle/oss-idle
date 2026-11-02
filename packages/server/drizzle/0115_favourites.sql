-- osu!web's beatmap favourites. By hand like 0038+.
ALTER TABLE `beatmapset` ADD COLUMN IF NOT EXISTS `favourite_count` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `favourite_beatmapset` (
	`user_id` int NOT NULL,
	`set_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favourite_beatmapset_user_id_set_id_pk` PRIMARY KEY(`user_id`,`set_id`),
	CONSTRAINT `favourite_beatmapset_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `favourite_beatmapset_set_id_beatmapset_id_fk` FOREIGN KEY (`set_id`) REFERENCES `beatmapset`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `favourite_beatmapset_user_idx` ON `favourite_beatmapset` (`user_id`,`created_at`);
