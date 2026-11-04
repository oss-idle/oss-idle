-- The queue stops after its last map instead of looping. By hand like 0038+.
ALTER TABLE `character` ADD COLUMN IF NOT EXISTS `queue_play_once` boolean DEFAULT false NOT NULL AFTER `autopilot_delay`;
