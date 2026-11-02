import type { Page } from '@playwright/test';

import { testAccounts } from '../support/accounts';
import { jpeg } from '../support/files';
import {
	expect,
	test,
} from '../support/fixtures';
import Game from '../support/game';

/**
 * Song select's carousel: every row, group headers included, rides osu!'s arc.
 */
/** The first group, open. The selection is random: its group can leave every header
 *  unmounted, or be this one and already open. */
const openFirstGroup = async (page: Page) => {
	await expect(async () => {
		await page.locator('.carousel').evaluate((el) => { el.scrollTop = 0; });
		const first = page.locator('.bm-group').first();
		await expect(first).toBeVisible({ timeout: 1000 });
		if ((await first.getAttribute('class'))?.includes('is-collapsed')) await first.click();
		await expect(page.locator('.bm-card[data-id]').first()).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
};

test.describe('carousel', () => {

	test('with groups, every row sits on the arc', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();

		await page.locator('.game__group .dropdown__current').click();
		await page.locator('.game__group .dropdown__option', { hasText: 'By Difficulty' }).click();
		await openFirstGroup(page);
		await page.locator('.carousel').evaluate((el) => { el.scrollTop = 300; });
		await page.waitForTimeout(500);

		// each mounted row's bow, against the bow its on-screen centre calls for
		const off = await page.locator('.carousel').evaluate((scroller) => {
			const half = scroller.clientHeight / 2;
			const top = scroller.getBoundingClientRect().top;
			return [...scroller.querySelectorAll<HTMLElement>('.bm-card')].map((el) => {
				const rect = el.getBoundingClientRect();
				const dist = Math.abs(1 - (rect.top + rect.height / 2 - top) / half);
				const want = (3 - Math.sqrt(Math.max(0, 9 - dist * dist))) * half;
				return Math.abs((parseFloat(el.style.translate) || 0) - want);
			});
		});
		expect(off.length).toBeGreaterThan(3);
		expect(Math.max(...off)).toBeLessThan(1);
		await page.screenshot({ path: test.info().outputPath('carousel-groups.png') });
	});

	test('a card menu keeps clicks off the cards behind it', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();

		const active = page.locator('.bm-card.is-active');
		await expect(active).toBeVisible();
		const id = await active.getAttribute('data-id');
		await active.click({ button: 'right' });
		await expect(page.locator('.ctxmenu')).toBeVisible();

		// the dim backdrop over another card cancels, like the gray Cancel bar
		const list = (await page.locator('.carousel').boundingBox())!;
		await page.mouse.click(list.x + list.width - 60, list.y + list.height / 4);
		await expect(page.locator('.ctxmenu')).toHaveCount(0);
		await expect(active).toHaveAttribute('data-id', id!);
	});

	test('a right click between two cards opens a menu, not a scroll', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();
		await expect(page.locator('.bm-card.is-active')).toBeVisible();
		await page.waitForTimeout(500);

		// the margin under a card, where the press reaches the carousel but no card
		const gap = await page.locator('.carousel').evaluate((scroller) => {
			const view = scroller.getBoundingClientRect();
			for (const el of scroller.querySelectorAll<HTMLElement>('.bm-card[data-id]:not(.is-active)')) {
				const { left, width, bottom } = el.getBoundingClientRect();
				const x = left + width / 2;
				const y = bottom + 2;
				const at = document.elementFromPoint(x, y);
				if (y > view.top + 10 && y < view.bottom - 10
					&& at && scroller.contains(at) && !at.closest('.bm-card')) return {
					x, y, 
				};
			}
			return undefined;
		});
		expect(gap).toBeDefined();
		const scroll = await page.locator('.carousel').evaluate((el) => el.scrollTop);
		await page.mouse.click(gap!.x, gap!.y, { button: 'right' });
		await expect(page.locator('.ctxmenu')).toBeVisible();
		await page.waitForTimeout(300);
		expect(await page.locator('.carousel').evaluate((el) => el.scrollTop)).toBe(scroll);
	});

	test('the right button scrubs beside the cards, off the leaderboard', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();
		const active = page.locator('.bm-card.is-active');
		await expect(active).toBeVisible();
		// the selection is random, and many maps have no scores yet
		await expect(async () => {
			await page.keyboard.press('F2');
			await expect(page.locator('.score_entry__row').first()).toBeVisible({ timeout: 3000 });
		}).toPass({ timeout: 60_000 });
		await page.waitForTimeout(1000);
		const carousel = page.locator('.carousel');
		const list = (await carousel.boundingBox())!;
		const card = (await active.boundingBox())!;
		const score = (await page.locator('.score_entry__row').first().boundingBox())!;
		const scrollTop = () => carousel.evaluate((el) => el.scrollTop);
		const drag = async (x: number, y: number, to: number) => {
			await page.mouse.move(x, y);
			await page.mouse.down({ button: 'right' });
			await page.mouse.move(x, to, { steps: 10 });
			await page.mouse.up({ button: 'right' });
			await page.waitForTimeout(500);
		};
		const y = card.y + card.height / 2;
		const bottom = list.y + list.height - 5;

		const before = await scrollTop();
		await drag(card.x + card.width / 2, y, bottom);
		await drag(score.x + score.width / 2, score.y + score.height / 2, bottom);
		expect(await scrollTop()).toBe(before);

		// between two scores, then just right of the leaderboard (above its rank-up badges)
		await drag(score.x + score.width - 10, score.y + score.height + 3, bottom);
		expect(await scrollTop()).toBe(before);
		await drag(score.x + score.width + 10, list.y + 15, bottom);
		expect(await scrollTop()).toBeGreaterThan(before);
	});

	test('a hovered card spreads its neighbours and keeps its gaps', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();
		await expect(page.locator('.bm-card.is-active')).toBeVisible();
		await page.waitForTimeout(500);

		// a card two below the active one, and the card under it
		const cards = page.locator('.bm-card.is-active ~ .bm-card[data-id]');
		const card = cards.nth(1);
		const next = cards.nth(2);
		const box = (await card.boundingBox())!;
		const gap = async () =>
			(await next.boundingBox())!.y - (await card.boundingBox())!.y - box.height;
		expect(await gap()).toBeLessThan(0);

		// its left end: the queue panel covers the right
		const x = box.x + 60;
		await page.mouse.move(x, box.y + box.height / 2);
		await expect(card).toHaveAttribute('data-hover');
		await page.waitForTimeout(400);
		expect(await gap()).toBeGreaterThan(5);

		const bottom = (await card.boundingBox())!.y + box.height;
		await page.mouse.move(x, bottom + 3);
		await page.waitForTimeout(400);
		await expect(card).toHaveAttribute('data-hover');
		await expect(next).not.toHaveAttribute('data-hover');
	});

	test('opening a group below a taller open one keeps its header in place', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();

		await page.locator('.game__group .dropdown__current').click();
		await page.locator('.game__group .dropdown__option', { hasText: 'By Difficulty' }).click();
		const groups = page.locator('.bm-group');
		await openFirstGroup(page);
		// scroll down to the next header, below the open group's cards
		await page.locator('.carousel').evaluate((el) => { el.scrollTop = el.scrollHeight; });
		await page.waitForTimeout(500);
		const next = groups.nth(1);
		const label = await next.locator('.bm-group__label').innerText();
		const before = (await next.boundingBox())!.y;

		await next.click();
		await page.waitForTimeout(500);
		const header = page.locator('.bm-group', { hasText: label });
		await expect(header).toHaveClass(/is-selected/);
		expect(Math.abs((await header.boundingBox())!.y - before)).toBeLessThan(2);
	});

	test('a map not downloaded shows the server\'s cover, not its background', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const cover = jpeg(800, 450);
		await page.route(/\/beatmap\/preview\/.*\.cover\.jpg$/i, route => route.fulfill({
			contentType: 'image/jpeg', body: cover,
		}));
		const backgrounds: string[] = [];
		page.on('request', (req) => {
			const url = req.url();
			if (url.includes('/beatmap/preview/') && !/\.(mp3|cover\.jpg)$/i.test(url)) backgrounds.push(url);
		});
		const game = new Game(page);
		await game.start();

		await expect(page.locator('.bm-card.is-remote[style*="blob:"]').first()).toBeVisible();
		await page.waitForTimeout(1000);
		// the selected map's backdrop is the one full background
		expect(new Set(backgrounds).size).toBeLessThanOrEqual(1);
	});

	test('a search from far down the list shows its results', async ({ game, page }) => {
		await game.start();
		const { set } = await game.easiestMap();
		const carousel = page.locator('.carousel');
		await expect(page.locator('.bm-card').first()).toBeVisible();
		await carousel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
		await page.waitForTimeout(500);

		await game.search(set.title);
		await expect(page.locator('.bm-card').first()).toBeVisible();
	});

	test('a cover baked once shows again without its background', async ({ playerAs }) => {
		const [ada] = await testAccounts('carousel');
		const page = await playerAs(ada);
		const game = new Game(page);
		await game.start();

		const covered = page.locator('.bm-card[data-id][style*="blob:"]');
		await expect(covered.first()).toBeVisible();
		// the longest title: a short one finds half the list, its card unmounted
		const title = await covered.evaluateAll(cards => cards
			.map(c => c.querySelector('.bm-card__title-text')?.textContent ?? '')
			.sort((a, b) => b.length - a.length)[0]);
		await game.search(title);
		const id = Number(await covered.first().getAttribute('data-id'));
		await page.screenshot({ path: test.info().outputPath('carousel-covers.png') });

		// with no background to fetch, only the stored cover can show
		await page.route(/\/beatmap\/preview\/.*\.(?!mp3$)[^.]+$/i, route => route.abort());
		await game.start();
		await game.search(title);
		await expect(game.card(id)).toHaveAttribute('style', /blob:/);
	});

});
