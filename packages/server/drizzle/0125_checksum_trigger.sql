-- checksum as a plain column kept by triggers: reading a stored generated column made MariaDB read the whole chart. By hand like 0038+.
ALTER TABLE `beatmap` MODIFY `checksum` char(64) NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TRIGGER `beatmap_checksum_insert` BEFORE INSERT ON `beatmap` FOR EACH ROW
	SET NEW.`checksum` = sha2(trim(leading convert(unhex('EFBBBF') using utf8mb4) from NEW.`chart`), 256);
--> statement-breakpoint
CREATE TRIGGER `beatmap_checksum_update` BEFORE UPDATE ON `beatmap` FOR EACH ROW
	SET NEW.`checksum` = sha2(trim(leading convert(unhex('EFBBBF') using utf8mb4) from NEW.`chart`), 256);
