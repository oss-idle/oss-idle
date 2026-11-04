import {
	expect,
	test,
} from '../support/fixtures';

/**
 * The options overlay. It is the one place a player changes how the game
 * behaves, and every control there writes a setting that has to survive the
 * tab being closed.
 */
test.describe('options', () => {

	const open = async (page: import('@playwright/test').Page) => {
		await page.keyboard.press('Control+Shift+O');
		await expect(page.locator('.options__container.open')).toBeVisible();
	};

	test('opens on its shortcut and closes on the backdrop', async ({ game, page }) => {
		await game.start();
		await open(page);
		await expect(page.locator('.options__panel')).toBeVisible();

		// clicking beside the panel closes it; the scene underneath is untouched
		await page.locator('.options__container').click({
			position: {
				x: 1100, y: 600,
			},
		});
		await expect(page.locator('.options__container.open')).toBeHidden();
		expect(await game.scene()).toBe('SELECT');

		// closed, none of it takes a click: its dropdowns once caught them at the screen's left edge
		await expect.poll(() => page.evaluate(() => {
			const hits = [];
			for (let y = 0; y < innerHeight; y += 10) hits.push(document.elementFromPoint(40, y));
			return hits.some(hit => hit?.closest('.options__container'));
		})).toBe(false);
	});

	test('the search narrows the settings list', async ({ game, page }) => {
		await game.start();
		await open(page);

		const search = page.locator('.options__search_input');
		await search.fill('fps');
		await expect(page.locator('.opt-checkbox', { hasText: 'Show FPS counter' })).toBeVisible();

		await search.fill('nothing matches this');
		await expect(page.locator('.options__empty')).toBeVisible();
	});

	test('a toggle writes its setting, and it survives a reload', async ({ game, page }) => {
		await game.start();
		expect(await game.setting('showFps')).toBe(false);

		await open(page);
		await page.locator('.options__search_input').fill('fps');
		const checkbox = page.locator('.opt-checkbox', { hasText: 'Show FPS counter' });
		await checkbox.click();
		await expect(checkbox).toHaveClass(/is-on/);
		await expect.poll(async () => game.setting('showFps')).toBe(true);
		// the counter it turns on is a real thing on screen
		await expect(page.locator('.fps-counter')).toBeVisible();

		await game.open();
		expect(await game.setting('showFps')).toBe(true);
	});

});
