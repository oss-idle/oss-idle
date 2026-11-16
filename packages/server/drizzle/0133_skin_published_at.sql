-- Skins published before /submit stamped published_at sorted last under Newest. By hand like 0038+.
UPDATE `skin` SET `published_at` = `created_at` WHERE `status` = 'PUBLISHED' AND `published_at` IS NULL;
