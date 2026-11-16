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
 * A signed-in character's queue lives on the server, which chains it whether or
 * not a game is open: every device shows the same queue, and closing the game
 * leaves the character playing it.
 */
test.describe('server queue', () => {
	let grace: Account;

	test.beforeEach(async () => {
		[grace] = await testAccounts('queue');
	});

	/** Play a map, leave gameplay, and queue another difficulty behind it. */
	const queueTwo = async (game: Game) => {
		await game.start();
		const { set, version } = await game.installEasiest();
		const other = set.versions.find(v => v.id !== version.id);
		test.skip(!other, 'the easiest set has a single difficulty');
		const play = await game.playThenLeave(set.title, version.id);
		await game.page.getByRole('button', { name: 'Edit the queue' }).click();
		await game.queueCard(other!.id);
		await game.page.keyboard.press('Escape');
		return {
			set, play, other: other!,
		};
	};

	test('another device shows the same queue', async ({ playerAs }) => {
		const { other } = await queueTwo(new Game(await playerAs(grace)));

		const second = new Game(await playerAs(grace));
		await second.start();
		await expect.poll(
			async () => (await second.queue())?.entries.map(e => e.id),
			{ timeout: 30_000 },
		).toEqual([other.id]);
	});

	test('closing the game leaves the character playing', async ({ playerAs }) => {
		const page = await playerAs(grace);
		const { set, play, other } = await queueTwo(new Game(page));
		await page.context().close();

		// back later, on another device: the same play, the same queue
		const back = new Game(await playerAs(grace));
		await back.start();
		await back.install(set.id);
		await expect.poll(async () => (await back.play())?.token, { timeout: 30_000 }).toBe(play.token);
		expect((await back.queue())?.entries.map(e => e.id)).toEqual([other.id]);
	});

	test('a Disabled queue is never built and never runs', async ({ playerAs }) => {
		await query(
			'UPDATE `mania4k_character` SET autopilot_mode = \'DISABLED\' WHERE id = ?', [grace.characterId],
		);
		const game = new Game(await playerAs(grace));
		await queueTwo(game);

		// only what was queued by hand, held: nothing offers to start it
		expect((await game.queue())?.entries).toHaveLength(1);
		await expect(game.page.getByRole('button', { name: 'Start the queue' })).toBeDisabled();
		const running = /^(Resume the queue|Pause after this map)$/;
		await expect(game.page.getByRole('button', { name: running })).toHaveCount(0);
	});
});
