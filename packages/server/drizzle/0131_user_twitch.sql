-- The Twitch account linked from the options. Written by hand like 0038+.
ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `twitch_id` varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_twitch_id_unique` ON `user` (`twitch_id`);
