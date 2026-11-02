import {
	type Account,
	query,
	testAccounts,
} from '../support/accounts';
import {
	expect,
	test,
} from '../support/fixtures';
import Game from '../support/game';

/**
 * osu!'s other mods: EZ and HR widen and tighten the hit windows, NF never fails
 * and is unranked, SD, PF and JT play the map again until it passes.
 */
test.describe('mods', () => {
	let kim: Account;

	test.beforeEach(async () => {
		[kim] = await testAccounts('mods');
	});

	type Row = { mods: string };
	const scoreRows = async () => query<Row>(
		'SELECT mods FROM mania4k_score WHERE character_id = ? ORDER BY id DESC',
		[kim.characterId],
	);

	test('mod select keeps osu!\'s conflicts', async ({ playerAs }) => {
		const page = await playerAs(kim);
		const game = new Game(page);
		await game.start();
		await page.keyboard.press('F1');
		const lit = page.locator('.mod-tile.is-on');

		const xp = page.locator('.mod-select__xp');
		await expect(xp).toHaveText('XP Multiplier: 1.00x');
		const tile = (name: string | RegExp) => page.locator('.mod-tile', { hasText: name });
		await tile('Easy').click();
		await expect(lit).toHaveText(['Easy']);
		await expect(xp).toHaveText('XP Multiplier: 0.50x');
		await expect(page.getByText('Most medals can\'t be earned with these mods')).toBeVisible();
		await tile('Hard Rock').click();
		await expect(lit).toHaveText(['Hard Rock']);
		await expect(xp).toContainText('Accuracy 1.10x');
		await expect(page.getByText('Most medals can\'t be earned with these mods')).toHaveCount(0);
		// SD, PF and JT share a tile: off -> SD -> PF -> JT
		const death = tile(/Sudden Death|Perfect|Justice/);
		await death.click();
		await expect(lit).toHaveText(['Hard Rock', 'Sudden Death']);
		await death.click();
		await expect(lit).toHaveText(['Hard Rock', 'Perfect']);
		await death.click();
		await expect(lit).toHaveText(['Hard Rock', 'Justice']);
		await tile('No Fail').click();
		await expect(lit).toHaveText(['No Fail', 'Hard Rock']);
		await expect(page.locator('.mod-select__unranked')).toBeVisible();
		await page.keyboard.press('2');
		await expect(page.locator('.is-mods .select-footer__active')).toHaveText('NFHR');

		await page.keyboard.press('F1');
		await page.keyboard.press('1');
		await expect(lit).toHaveCount(0);
	});

	test('an HR play is ranked and keeps its mods', async ({ playerAs }) => {
		const page = await playerAs(kim);
		const game = new Game(page);
		await game.start();
		await page.evaluate(() => window.__idle!.setSetting('mods', ['HR']));
		const { set, version } = await game.installEasiest();
		await game.search(set.title);
		await game.playCard(version.id);
		await game.waitForPlay();
		await game.skipToEnd();
		await game.expectScene('RESULT');
		// the badge reads HR, its accessible name is the mod's
		await expect(page.locator('.result__mod[aria-label="Hard Rock"]')).toBeVisible();
		expect((await scoreRows())[0]?.mods).toBe('HR');
	});

	test('an NF play is local and submits nothing', async ({ playerAs }) => {
		const page = await playerAs(kim);
		const game = new Game(page);
		await game.start();
		await page.evaluate(() => window.__idle!.setSetting('mods', ['NF']));
		const before = (await scoreRows()).length;
		const { set, version } = await game.installEasiest();
		await game.search(set.title);
		await game.playCard(version.id);
		expect((await game.waitForPlay()).mode).toBe('unranked');
		await game.skipToEnd();
		await game.expectScene('RESULT');
		expect(await scoreRows()).toHaveLength(before);
	});

	test('PF plays the map again on a fail', async ({ playerAs }) => {
		const page = await playerAs(kim);
		const game = new Game(page);
		await game.start();
		// a fresh character never goes a whole map marvelous
		await page.evaluate(() => window.__idle!.setSetting('mods', ['PF']));
		const before = (await scoreRows()).length;
		const { set, version } = await game.installEasiest();
		await game.search(set.title);
		await game.playCard(version.id);
		const first = await game.waitForPlay();
		await page.waitForFunction(
			token => {
				const play = window.__idle!.play();
				return !!play && play.token !== token;
			},
			first.token,
			{ timeout: 90_000 },
		);
		const again = (await game.play())!;
		expect(again.beatmapId).toBe(version.id);
		await game.expectScene('GAME');
		expect(await scoreRows()).toHaveLength(before);
	});
});
