import {
	expect,
	test,
} from '../support/fixtures';

/**
 * What a guest owns lives in the browser: the local sql.js database behind
 * IndexedDB, plus the settings. A reload is the cheapest way to ask whether any
 * of it was actually written, rather than only held in memory.
 */
test.describe('local persistence', () => {

	test('a downloaded map, its score and the xp it paid survive a reload', async ({ game }) => {
		await game.start();
		const { set, version } = await game.installEasiest();

		await game.search(set.title);
		await game.playCard(version.id);
		await game.waitForPlay();
		await game.skipToEnd();
		const scores = await game.waitForScores();
		const before = await game.character();

		await game.open();

		expect(await game.installedSets()).toContain(set.id);
		const after = await game.scores();
		expect(after).toHaveLength(1);
		expect(after[0].score).toBe(scores[0].score);
		expect(after[0].grade).toBe(scores[0].grade);

		const character = await game.character();
		expect(character.id).toBe(before.id);
		expect(character.overallTotalXp).toBe(before.overallTotalXp);
		expect(character.skills.map(s => s.level))
			.toEqual(before.skills.map(s => s.level));

		// and the xp breakdown the song select indicators read
		const gains = await game.xpGains();
		expect(gains).toHaveLength(1);
		expect(gains[0].beatmapId).toBe(version.id);
	});

	test('clearing a map\'s local scores sticks after a reload', async ({ game, page }) => {
		await game.start();
		const { set, version } = await game.installEasiest();

		await game.search(set.title);
		await game.playCard(version.id);
		await game.waitForPlay();
		await game.skipToEnd();
		await game.waitForScores();

		await game.start();
		await game.search(set.title);
		await game.selectCard(version.id);
		await page.locator('.lb__select').first().locator('.dropdown__current').click();
		await page.locator('.lb__select .dropdown__option', { hasText: 'Local' }).click();
		await expect(page.locator('.lb__list')).toBeVisible();
		await game.card(version.id).click({ button: 'right' });
		await page.locator('.ctxmenu__option', { hasText: 'Clear local scores' }).click();
		await expect(page.locator('.lb__empty', { hasText: 'No scores yet' })).toBeVisible();

		await game.open();
		expect(await game.scores()).toHaveLength(0);
		expect(await game.xpGains()).toHaveLength(0);
	});

	test('settings survive a reload', async ({ game, page }) => {
		await game.start();
		expect(await game.setting('backgroundDim')).toBe(0.8);

		await page.evaluate(() => window.__idle!.setSetting('backgroundDim', 0.35));
		await page.evaluate(() => window.__idle!.setSetting('autopilotDelay', 5));

		await game.open();
		expect(await game.setting('backgroundDim')).toBe(0.35);
		expect(await game.setting('autopilotDelay')).toBe(5);
	});

	test('the queue is deliberately not stored', async ({ game, page }) => {
		await game.start();
		const { set, version } = await game.installEasiest();
		const other = set.versions.find(v => v.id !== version.id);
		test.skip(!other, 'the easiest set has a single difficulty');

		await game.playThenLeave(set.title, version.id);
		await page.getByRole('button', { name: 'Edit the queue' }).click();
		await game.queueCard(other!.id);
		expect((await game.queue())?.entries.length).toBeGreaterThan(0);

		// it dies with the tab, like the play it feeds
		await game.open();
		expect(await game.queue()).toBeUndefined();
		expect(await game.play()).toBeUndefined();
	});

});
