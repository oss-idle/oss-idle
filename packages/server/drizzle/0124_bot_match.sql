-- A player's bot match. By hand like 0038+.
CREATE TABLE IF NOT EXISTS `bot_match` (
	`user_id` int NOT NULL,
	`status` enum('queued','running','refining','done','failed') NOT NULL DEFAULT 'queued',
	`failure` enum('too_few_plays','unavailable'),
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp NULL,
	`result` json,
	PRIMARY KEY (`user_id`),
	KEY `bot_match_queue` (`status`, `requested_at`),
	CONSTRAINT `bot_match_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
);
