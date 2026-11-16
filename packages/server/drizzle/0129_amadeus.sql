-- Amadeus, the account that plays by itself on stream: osu! has no user 1, so no one can sign in as it.
INSERT INTO `user` (`id`, `username`, `country`, `keep_playing`) VALUES (1, 'Amadeus', 'JP', false);
--> statement-breakpoint
INSERT INTO `character` (`user_id`, `name`) VALUES (1, 'Amadeus');
--> statement-breakpoint
UPDATE `user` SET `current_character` = (SELECT `id` FROM `character` WHERE `user_id` = 1) WHERE `id` = 1;
