import type { Page } from '@playwright/test';

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

test.describe('genetics', () => {

	test('a character with no genetic is asked on song select, and can say later', async ({
		game, page,
	}) => {
		await game.open({ geneticAsk: true });
		await page.evaluate(() => window.__idle!.enter('SELECT'));
		const choice = page.locator('.genetic-choice');
		await expect(choice).toBeVisible();

		// a key pressed the moment it shows is gone
		await expect(async () => {
			await page.keyboard.press('Escape');
			await expect(choice).toBeHidden({ timeout: 1000 });
		}).toPass();
		await game.expectScene('SELECT');
	});

	test('the skill trees can be looked at before picking, read-only', async ({ game, page }) => {
		await game.open({ geneticAsk: true });
		await page.evaluate(() => window.__idle!.enter('SELECT'));

		await page.getByRole('button', { name: 'See the skill trees' }).click();
		await expect(page.locator('.genetics--preview')).toBeVisible();
		await page.locator('.wheel-tree.is-top .gene--pickable').first().dispatchEvent('click');
		await expect(page.locator('.gene-card')).toBeVisible();
		await expect(page.locator('.gene-card__learn')).toHaveCount(0);

		await page.keyboard.press('Escape');
		await expect(page.locator('.genetics--preview')).toBeHidden();
		await expect(page.locator('.genetic-ring')).toBeVisible();
	});

	test('a genetic once picked is kept, and not asked for again', async ({ game, page }) => {
		await game.open({ geneticAsk: true });
		await page.evaluate(() => window.__idle!.enter('SELECT'));
		await game.pickGenetic();
		await expect(page.locator('.genetics')).toBeVisible();

		await game.open({ geneticAsk: true });
		await page.evaluate(() => window.__idle!.enter('SELECT'));
		await expect(page.locator('.bm-card').first()).toBeVisible();
		await expect(page.locator('.genetic-choice')).toBeHidden();
	});
});

/** On a signed-in character, against the real server: one genetic per generation. */
test.describe('genetics of a reborn character', () => {
	const DAY = 24 * 3600_000;
	let uma: Account;

	type Saved = {
		picks: { skill: string, changedAt?: number }[],
		genes: Record<string, number>,
		converted: Record<string, number>,
	};

	const seed = (generation: number, picks: Saved['picks'], xp = 0) => query(
		`UPDATE mania4k_character
		SET generation = ?, genetics = ?, overall_lifetime_xp = ?, speed_lifetime_xp = ?
		WHERE id = ?`,
		[generation, JSON.stringify({
			picks, genes: {}, converted: { speed: 5000 }, fees: {},
		}), xp, xp, uma.characterId],
	);

	const saved = async (id: number): Promise<Saved> => {
		const [row] = await query<{ genetics: string | Saved }>(
			'SELECT genetics FROM mania4k_character WHERE id = ?', [id],
		);
		return typeof row.genetics === 'string' ? JSON.parse(row.genetics) as Saved : row.genetics;
	};

	const current = async () => (await query<{ current_character: number }>(
		'SELECT current_character FROM user WHERE id = ?', [uma.id],
	))[0].current_character;

	const atSongSelect = async (page: Page) => {
		const game = new Game(page);
		await game.open({
			local: false, geneticAsk: true, 
		});
		await page.evaluate(() => window.__idle!.enter('SELECT'));
		return game;
	};

	const characterTab = async (page: Page, tab: string) => {
		await page.locator('.dock__btn--upgrades').first().click();
		await page.locator('.page__tab', { hasText: tab }).click();
	};

	const onRing = (page: Page, name: string) => page.locator('.genetic-ring__skill')
		.filter({ has: page.getByText(name, { exact: true }) });

	test.beforeEach(async () => {
		[uma] = await testAccounts('genetics');
		const reborn = await query<{ id: number }>(
			'SELECT id FROM `character` WHERE user_id = ? AND id <> ?', [uma.id, uma.characterId],
		);
		for (const { id } of reborn) {
			await query('DELETE FROM mania4k_character WHERE id = ?', [id]);
			await query('DELETE FROM `character` WHERE id = ?', [id]);
		}
		// a rebirth left it the _old name
		await query('UPDATE `character` SET name = ? WHERE id = ?', [uma.name, uma.characterId]);
	});

	test('a rebirth asks for two genetics, with climaxx from zero', async ({ playerAs }) => {
		await seed(1, [{ skill: 'speed' }], 1e15);
		const page = await playerAs(uma);
		const game = await atSongSelect(page);
		await expect(page.locator('.genetic-choice')).toBeHidden();

		await characterTab(page, 'Rebirth');
		await page.locator('.rebirth__name').fill(uma.name);
		await page.locator('.rebirth__form .upgrade__buy').click();
		await page.locator('.ctxmenu__option', { hasText: 'Rebirth' }).click();
		await expect.poll(async () => (await game.character()).generation).toBe(2);

		// the rebirth medal's overlay comes first: Escape on it can close the ask, which comes back
		await atSongSelect(page);
		const choice = page.locator('.genetic-choice');
		await expect(choice).toBeVisible();
		await onRing(page, 'Speed').click();
		await choice.getByRole('button', { name: 'Begin with Speed' }).click();
		await expect(choice).toBeVisible();
		await onRing(page, 'Memory').click();
		await choice.getByRole('button', { name: 'Begin with Memory' }).click();
		await expect(choice).toBeHidden();

		const reborn = await current();
		expect(reborn).not.toBe(uma.characterId);
		await expect.poll(async () => (await saved(reborn)).picks.map(p => p.skill))
			.toEqual(['speed', 'memory']);
		const genetics = await saved(reborn);
		expect(genetics.converted).toEqual({});
		// the one left behind keeps its own
		expect((await saved(uma.characterId)).converted).toEqual({ speed: 5000 });
	});

	test('each genetic has its own cooldown, and is replaced from the ring', async ({ playerAs }) => {
		const now = Date.now();
		await seed(2, [
			{
				skill: 'speed', changedAt: now - 8 * DAY, 
			},
			{
				skill: 'stamina', changedAt: now, 
			},
		]);
		const page = await playerAs(uma);
		await atSongSelect(page);
		await characterTab(page, 'Genetics');
		await page.getByRole('button', { name: 'Change genetics' }).click();

		const choice = page.locator('.genetic-choice');
		await onRing(page, 'Stamina').click();
		await expect(onRing(page, 'Stamina')).not.toHaveClass(/is-leaving/);
		await onRing(page, 'Memory').click();
		await expect(choice.getByRole('button', { name: /^Replace/ })).toHaveCount(0);

		await onRing(page, 'Speed').click();
		await expect(onRing(page, 'Speed')).toHaveClass(/is-leaving/);
		await onRing(page, 'Memory').click();
		await choice.getByRole('button', { name: 'Replace Speed with Memory' }).click();
		await expect(choice).toBeHidden();

		// the pick shows at once, the server confirms it meanwhile
		await expect.poll(async () => (await saved(uma.characterId)).picks.map(p => p.skill))
			.toEqual(['memory', 'stamina']);
		const { picks } = await saved(uma.characterId);
		expect(picks[0].changedAt).toBeGreaterThan(now);
		expect(picks[1].changedAt).toBe(now);

		// the server holds the other one to its cooldown too
		const refused = await page.request.post('/v1/me/genetics/pick', {
			data: {
				skill: 'accuracy', slot: 1, 
			}, 
		});
		expect(refused.ok()).toBe(false);
		expect((await saved(uma.characterId)).picks[1].skill).toBe('stamina');

		// and it is still there after a reload
		await atSongSelect(page);
		await expect(choice).toBeHidden();
	});

	test('genetics side by side add up on the ring', async ({ playerAs }) => {
		await seed(3, [{ skill: 'stamina' }, { skill: 'coordination' }]);
		const page = await playerAs(uma);
		await atSongSelect(page);

		// a third to pick: Speed sits between the two held, half from each
		const choice = page.locator('.genetic-choice');
		await expect(choice).toBeVisible();
		const tag = (name: string) => onRing(page, name).locator('.genetic-ring__tag');
		await expect(tag('Stamina')).toHaveText('★');
		await expect(tag('Speed')).toHaveText('100%');
		await onRing(page, 'Speed').hover();
		await expect(page.locator('.genetic-ring__hub')).toContainText('50% from Stamina');
		await expect(page.locator('.genetic-ring__hub')).toContainText('50% from Coordination');

		// picked, all three add up
		await onRing(page, 'Speed').click();
		await expect(tag('Speed')).toHaveText('★ 200%');
		await expect(tag('Stamina')).toHaveText('★ 150%');
		await expect(tag('Coordination')).toHaveText('★ 150%');
	});

	test('a reborn character learns a gene and plays with it', async ({ playerAs }) => {
		await seed(2, [{ skill: 'speed' }, { skill: 'memory' }]);
		const page = await playerAs(uma);
		const game = await atSongSelect(page);
		const { set, version } = await game.installEasiest();

		await characterTab(page, 'Genetics');
		await page.locator('.wheel-tree.is-top .gene--pickable').first().dispatchEvent('click');
		await page.locator('.gene-card__learn').click();
		await page.locator('.ctxmenu__option', { hasText: 'Learn' }).click();
		await expect.poll(async () => {
			const { genes } = await saved(uma.characterId);
			return Object.values(genes).reduce((sum, tier) => sum + tier, 0);
		}).toBe(1);
		await page.keyboard.press('Escape');
		await expect(page.locator('.genetics')).toBeHidden();

		await game.search(set.title);
		await game.playCard(version.id);
		await game.waitForPlay();
		await game.skipToEnd();
		await game.expectScene('RESULT');
		await expect.poll(async () => (await query<{ xp: number }>(
			'SELECT overall_lifetime_xp AS xp FROM mania4k_character WHERE id = ?', [uma.characterId],
		))[0].xp).toBeGreaterThan(0);
	});
});
