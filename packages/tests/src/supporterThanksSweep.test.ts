import {
	describe,
	expect,
	it,
	vi,
} from 'vitest';

const hash = new Map<string, string>();
const received = vi.fn<() => Promise<number>>();
const sendMail = vi.fn<(mail: { raw: Buffer }) => Promise<void>>(async () => {});

vi.mock('../../server/src/env', () => ({
	env: {
		SMTP_URL: 'smtp://u:p@mail', SERVER_MONTHLY_COST: 46, SUPPORTER_TAXES: [],
	},
	clientUrl: 'https://game',
	redisKeyPrefix: 'test:',
	isProd: false,
	isPbe: false,
}));
vi.mock('../../server/src/redis', () => ({
	redis: {
		set: async () => 'OK',
		del: async () => 1,
		hgetall: async () => Object.fromEntries(hash),
		hdel: async (_: string, id: string) => Number(hash.delete(id)),
	},
}));
vi.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));
vi.mock('../../server/src/abby', () => ({ received }));
vi.mock('../../server/src/mailSent', () => ({ fileSent: async () => {} }));
vi.mock('../../server/src/discord/error', () => ({ warn: vi.fn() }));

const order = {
	id: 1, buyerId: 2, recipientId: 2, months: 1, recurring: false, paymentIntent: 'pi', refunded: 0,
};
// every query resolves to the next of these: orderRows, then the buyer's order count
const results = [[order], [{ n: 1 }]];
const chain: object = new Proxy({}, {
	get: (_, key) => key === 'then'
		? (resolve: (rows: unknown) => void) => resolve(results.shift())
		: () => chain,
});
vi.mock('../../server/src/db/client', () => ({ db: { select: () => chain } }));

const { sweepThanks } = await import('../../server/src/supporter');

const queue = (at: number) => hash.set('1', JSON.stringify({
	to: 'a@b.c', before: {
		months: 0, active: false,
	}, at,
}));
const lastText = () => sendMail.mock.lastCall?.[0].raw.toString() ?? '';

describe('supporter thank-you sweep', () => {
	it('waits for the net amount, then sends with the server time', async () => {
		queue(Date.now());
		received.mockRejectedValueOnce(new Error('no balance transaction'));
		results.unshift([order]);
		await sweepThanks();
		expect(sendMail).not.toHaveBeenCalled();
		expect(hash.has('1')).toBe(true);

		received.mockResolvedValueOnce(2493);
		await sweepThanks();
		expect(lastText()).toContain('keeps the server running for');
		expect(hash.has('1')).toBe(false);
	});

	it('sends without the server time once it has waited long enough', async () => {
		queue(Date.now() - 11 * 60_000);
		results.push([order], [{ n: 1 }]);
		received.mockRejectedValueOnce(new Error('no balance transaction'));
		await sweepThanks();
		expect(sendMail).toHaveBeenCalledTimes(2);
		expect(lastText()).not.toContain('server running');
		expect(hash.has('1')).toBe(false);
	});
});
