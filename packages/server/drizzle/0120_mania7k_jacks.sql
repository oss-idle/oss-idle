-- 7K's chords skill is jacks (jacks and chordjacks as one). Dev-only ruleset, no player data. By hand like 0107.
ALTER TABLE `mania7k_character`
	RENAME COLUMN `chords_level` TO `jacks_level`,
	RENAME COLUMN `chords_xp` TO `jacks_xp`,
	RENAME COLUMN `chords_total_xp` TO `jacks_total_xp`,
	RENAME COLUMN `chords_lifetime_xp` TO `jacks_lifetime_xp`,
	RENAME COLUMN `chords_upgrades` TO `jacks_upgrades`,
	RENAME COLUMN `chords_prestige` TO `jacks_prestige`,
	RENAME COLUMN `chords_overdrive` TO `jacks_overdrive`;
