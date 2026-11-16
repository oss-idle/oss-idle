-- Bots: the group of the accounts no one signs in as, MakiseBot (3) and Amadeus (1). By hand like 0038+.
ALTER TABLE `user_group` MODIFY COLUMN `group` enum('admin','gmt','bn','bot') NOT NULL;
--> statement-breakpoint
INSERT IGNORE INTO `user_group` (`user_id`, `group`) VALUES (3, 'bot'), (1, 'bot');
