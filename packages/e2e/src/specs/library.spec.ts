import { testAccounts } from '../support/accounts';
import {
	expect,
	test,
} from '../support/fixtures';
import Game from '../support/game';
import {
	difficultyOf,
	upload,
} from '../support/uploads';

/** The maps a player keeps: deleting one difficulty or its whole set, and updating a map
 *  that changed on the server since its download. */
test.describe('library', () => {

	test('delete asks for the whole set or only the difficulty', async ({ game, page }) => {
		await game.start();
		const set = (await game.catalog()).find(s => s.bundled && s.id < 1_000_000_000
			&& s.versions.filter(v => v.mode === 3 && v.keys === 4).length >= 2);
		if (!set) throw new Error('the catalog has no bundled set with two 4K difficulties');
		const [kept, dropped] = set.versions.filter(v => v.mode === 3 && v.keys === 4);
		await game.install(set.id);
		await game.search(set.title);
		await game.selectCard(dropped.id);

		const option = (text: string) => page.locator('.ctxmenu__option', { hasText: text });
		await game.card(dropped.id).click({ button: 'right' });
		await option('Delete...').click();
		await expect(option('Delete all difficulties')).toBeVisible();
		await option(`Delete only ${dropped.version}`).click();

		// the set stays; the difficulty is a download again, which brings the set back whole
		await expect(game.card(dropped.id)).toContainText('Double click to download');
		await expect(game.card(kept.id)).not.toContainText('Double click to download');
		expect(await game.installedSets()).toContain(set.id);
		await game.card(dropped.id).dblclick();
		await expect(game.card(dropped.id)).not.toContainText('Double click to download');
	});

	test('a map changed on the server offers its update in place of its board', async ({
		playerAs,
	}) => {
		const [tara] = await testAccounts('library');
		const page = await playerAs(tara);
		const game = new Game(page);
		await game.openMenu();
		const title = `Update ${Date.now()}`;
		const setId = await upload(page, tara, title);
		const diffId = await difficultyOf(page, setId);
		await page.evaluate(link => new BroadcastChannel('oss-idle:links').postMessage(link), `oss-idle://dl/${setId}`);
		await expect(page.locator('.message__contents', { hasText: `Downloaded ${title}` })).toBeVisible();

		await game.enterSongSelect();
		await game.search(title);
		// the only result is selected on its own: another click would play it
		await expect(game.card(diffId)).toHaveClass(/is-active/, { timeout: 30_000 });
		const tab = async (name: string) => {
			await page.locator('.lb__select .dropdown__current').click();
			await page.locator('.lb__select .dropdown__option', { hasText: name }).click();
		};
		await tab('Global');
		await expect(page.locator('.lb__empty', { hasText: 'No scores yet' })).toBeVisible();
		const update = page.locator('.lb-update');
		await expect(update).toBeHidden();

		await upload(page, tara, title, {
			setId, count: 9,
		});
		await tab('Local');
		await tab('Global');
		await expect(update).toBeVisible();
		await update.click();
		await expect(update).toBeHidden();
		await expect(page.locator('.lb__empty', { hasText: 'No scores yet' })).toBeVisible();
	});

});
