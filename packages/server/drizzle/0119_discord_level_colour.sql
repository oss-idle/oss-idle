-- A supporter keeps their level colour on Discord instead of the Supporter pink. By hand like 0038+.
ALTER TABLE `user` ADD COLUMN IF NOT EXISTS `discord_level_colour` boolean DEFAULT false NOT NULL;
