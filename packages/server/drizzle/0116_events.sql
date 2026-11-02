-- osu!web's profile events, the recent activity. By hand like 0038+.
CREATE TABLE IF NOT EXISTS `event` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`character_id` int,
	`ruleset` varchar(16),
	`type` varchar(32) NOT NULL,
	`data` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `event_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `event_character_id_character_id_fk` FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `event_user_idx` ON `event` (`user_id`,`created_at`);
--> statement-breakpoint
-- The history the tables already hold: medals, #1s, renames, supporter tags, players' maps.
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, m.`character_id`, 'mania4k', 'achievement', JSON_OBJECT('medalId', m.`medal_id`), m.`unlocked_at`
FROM `mania4k_character_medal` m JOIN `character` c ON c.`id` = m.`character_id`;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, m.`character_id`, 'mania7k', 'achievement', JSON_OBJECT('medalId', m.`medal_id`), m.`unlocked_at`
FROM `mania7k_character_medal` m JOIN `character` c ON c.`id` = m.`character_id`;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, m.`character_id`, 'osu', 'achievement', JSON_OBJECT('medalId', m.`medal_id`), m.`unlocked_at`
FROM `osu_character_medal` m JOIN `character` c ON c.`id` = m.`character_id`;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, f.`character_id`, 'mania4k', 'rank', JSON_OBJECT('beatmapId', f.`beatmap_id`, 'rank', 1, 'grade', f.`grade`), f.`played_at`
FROM `mania4k_first_place` f JOIN `character` c ON c.`id` = f.`character_id` WHERE f.`played_at` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, f.`character_id`, 'mania7k', 'rank', JSON_OBJECT('beatmapId', f.`beatmap_id`, 'rank', 1, 'grade', f.`grade`), f.`played_at`
FROM `mania7k_first_place` f JOIN `character` c ON c.`id` = f.`character_id` WHERE f.`played_at` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, f.`character_id`, 'osu', 'rank', JSON_OBJECT('beatmapId', f.`beatmap_id`, 'rank', 1, 'grade', f.`grade`), f.`played_at`
FROM `osu_first_place` f JOIN `character` c ON c.`id` = f.`character_id` WHERE f.`played_at` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT c.`user_id`, h.`character_id`, NULL, 'usernameChange', JSON_OBJECT('previousUsername', h.`name`,
	'username', COALESCE(LEAD(h.`name`) OVER (PARTITION BY h.`character_id` ORDER BY h.`id`), c.`name`)), h.`changed_at`
FROM `character_name_history` h JOIN `character` c ON c.`id` = h.`character_id`;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT s.`user_id`, NULL, NULL,
	CASE WHEN s.`gift` THEN 'userSupportGift' WHEN s.`n` = 1 THEN 'userSupportFirst' ELSE 'userSupportAgain' END,
	JSON_OBJECT(), s.`at`
FROM (
	SELECT t.*, ROW_NUMBER() OVER (PARTITION BY t.`user_id` ORDER BY t.`at`) n FROM (
		SELECT `recipient_id` user_id, `buyer_id` <> `recipient_id` gift, `created_at` at FROM `supporter_order` WHERE `recipient_id` IS NOT NULL
		UNION ALL
		SELECT `user_id`, false, `created_at` FROM `itch_donation` WHERE `user_id` IS NOT NULL
	) t
) s;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT u.`id`, NULL, NULL, 'beatmapsetUpload', JSON_OBJECT('setId', b.`id`), b.`created_at`
FROM `beatmapset` b JOIN `user` u ON u.`id` = b.`owner_user_id`
WHERE b.`osu_id` IS NULL AND b.`deleted_at` IS NULL;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT u.`id`, NULL, NULL, 'beatmapsetUpdate', JSON_OBJECT('setId', b.`id`), b.`uploaded_at`
FROM `beatmapset` b JOIN `user` u ON u.`id` = b.`owner_user_id`
WHERE b.`osu_id` IS NULL AND b.`deleted_at` IS NULL AND b.`uploaded_at` > b.`created_at` + INTERVAL 1 MINUTE;
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT u.`id`, NULL, 'mania4k', 'beatmapsetApprove', JSON_OBJECT('setId', b.`id`, 'status', s.`status`), s.`ranked_at`
FROM `beatmapset` b JOIN `user` u ON u.`id` = b.`owner_user_id` JOIN `mania4k_beatmapset_status` s ON s.`set_id` = b.`id`
WHERE b.`deleted_at` IS NULL AND s.`status` IN ('ranked', 'loved') AND s.`ranked_at` <= now();
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT u.`id`, NULL, 'mania7k', 'beatmapsetApprove', JSON_OBJECT('setId', b.`id`, 'status', s.`status`), s.`ranked_at`
FROM `beatmapset` b JOIN `user` u ON u.`id` = b.`owner_user_id` JOIN `mania7k_beatmapset_status` s ON s.`set_id` = b.`id`
WHERE b.`deleted_at` IS NULL AND s.`status` IN ('ranked', 'loved') AND s.`ranked_at` <= now();
--> statement-breakpoint
INSERT INTO `event` (`user_id`, `character_id`, `ruleset`, `type`, `data`, `created_at`)
SELECT u.`id`, NULL, 'osu', 'beatmapsetApprove', JSON_OBJECT('setId', b.`id`, 'status', s.`status`), s.`ranked_at`
FROM `beatmapset` b JOIN `user` u ON u.`id` = b.`owner_user_id` JOIN `osu_beatmapset_status` s ON s.`set_id` = b.`id`
WHERE b.`deleted_at` IS NULL AND s.`status` IN ('ranked', 'loved') AND s.`ranked_at` <= now();
