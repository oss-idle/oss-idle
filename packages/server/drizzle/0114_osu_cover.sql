-- Whether osu! serves covers for the set: `check:covers` fills it for the sets stored before. By hand like 0038+.
ALTER TABLE `beatmapset` ADD COLUMN IF NOT EXISTS `osu_cover` boolean NOT NULL DEFAULT true;
