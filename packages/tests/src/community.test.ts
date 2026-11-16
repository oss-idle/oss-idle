import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	firstPlaceMessage,
	isSkillLevelMilestone,
	skillLevelMessage,
} from '@oss-idle/shared/community/announcements';
import { presenceEntryDTO } from '@oss-idle/shared/community/presence';
import {
	chatLineDTO,
	clientMessage,
	knowsLegacyChannel,
	serverMessage,
} from '@oss-idle/shared/community/wire';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';

describe('clients from before the rename', () => {
	it('know the default channel by its old name up to 1.0.1.0', () => {
		expect(knowsLegacyChannel('1.0.1.0')).toBe(true);
		expect(knowsLegacyChannel('1.0.0.2')).toBe(true);
		expect(knowsLegacyChannel('0.19.1')).toBe(true);
		expect(knowsLegacyChannel('1.0.1.1')).toBe(false);
		expect(knowsLegacyChannel('1.1.0.0')).toBe(false);
	});
});

describe('community wire contract', () => {
	it('round-trips a presence entry', () => {
		const entry = {
			characterId: 7,
			userId: 70,
			name: 'tester',
			avatarUrl: 'https://example.com/a.png',
			country: 'FR',
			rank: 42,
			pp: 1234.5,
			accuracy: 0.987,
			playCount: 321,
			level: 50,
			status: 'playing' as const,
			nowPlaying: 'Artist - Title',
			loc: {
				x: 0.5, y: 0.25,
			},
			tz: 'Europe/Paris',
		};
		expect(presenceEntryDTO.parse(entry)).toEqual(entry);
	});

	it('accepts a minimal presence entry (optionals omitted)', () => {
		const entry = {
			characterId: 1,
			userId: 10,
			name: 'guestless',
			avatarUrl: 'x',
			country: 'JP',
			pp: 0,
			accuracy: 0,
			playCount: 0,
			level: 0,
			status: 'idle' as const,
		};
		expect(presenceEntryDTO.parse(entry)).toEqual(entry);
	});

	it('rejects an unknown status', () => {
		expect(presenceEntryDTO.safeParse({
			characterId: 1, userId: 1, name: 'x', avatarUrl: 'x', country: 'x',
			pp: 0, accuracy: 0, playCount: 0, level: 0, status: 'sleeping',
		}).success).toBe(false);
	});

	it('parses each client message variant and rejects bad ones', () => {
		expect(clientMessage.safeParse({
			type: 'chat', channel: '#oss!idle', text: 'hi',
		}).success).toBe(true);
		expect(clientMessage.safeParse({
			type: 'status', status: 'afk',
		}).success).toBe(true);
		// playing is server-only, never a client-reported status
		expect(clientMessage.safeParse({
			type: 'status', status: 'playing',
		}).success).toBe(false);
		// empty chat text is rejected
		expect(clientMessage.safeParse({
			type: 'chat', channel: '#oss!idle', text: '',
		}).success).toBe(false);
	});

	it('round-trips a private message both ways', () => {
		const message = {
			id: 'p1',
			from: {
				userId: 30, characterId: 3, name: 'someone', color: '#fff09a',
			},
			to: 40,
			text: 'gz on the #1',
			at: 1_700_000_000_000,
		};
		expect(serverMessage.parse({
			type: 'pm', message,
		})).toEqual({
			type: 'pm', message,
		});
		expect(clientMessage.parse({
			type: 'pm', to: 40, text: 'hi',
		})).toEqual({
			type: 'pm', to: 40, text: 'hi',
		});
		expect(clientMessage.safeParse({
			type: 'pm', to: 40, text: '',
		}).success).toBe(false);
	});

	it('round-trips a player chat message', () => {
		const msg = {
			type: 'chat' as const,
			line: {
				id: 'm1',
				kind: 'player' as const,
				channel: '#oss!idle',
				from: {
					characterId: 3, userId: 30, name: 'someone', color: '#fa81c6',
				},
				text: 'hello',
				at: 1_700_000_000_000,
			},
		};
		expect(serverMessage.parse(msg)).toEqual(msg);
		expect(chatLineDTO.parse(msg.line)).toEqual(msg.line);
	});

	it('round-trips the pushed character, parked purchases and all', () => {
		const skills = Object.fromEntries(Skills.map(s => [s, {
			level: 92,
			xp: 1200,
			upgrades: 8,
			overdrive: 7.7,
			prestige: 0,
			lifetimeXp: 4_000_000,
		}]));
		const msg = {
			type: 'character' as const,
			character: {
				id: 7,
				userId: 3,
				name: 'someone',
				avatarUrl: 'https://example.invalid/a.png',
				country: 'FR',
				ruleset: 'mania4k' as const,
				generation: 1,
				overallLevel: 88,
				skills,
				pendingActions: [{
					type: 'upgrade' as const, ruleset: 'mania4k' as const, skill: 'accuracy', requestedAt: 1_700_000_000_000,
				}],
			},
		};
		expect(JSON.parse(JSON.stringify(serverMessage.parse(msg)))).toEqual(msg);
	});

	it('round-trips a system chat message (no sender)', () => {
		const line = {
			id: 'm2',
			kind: 'system' as const,
			channel: '#oss!idle',
			color: '#fa81c6',
			text: 'someone achieved rank #1 on Artist - Title [Hard]',
			at: 1_700_000_000_000,
		};
		expect(chatLineDTO.parse(line)).toEqual(line);
	});
});

describe('play wire contract', () => {
	it('parses each play client message variant', () => {
		expect(clientMessage.safeParse({
			type: 'play:start', beatmapId: 42,
		}).success).toBe(true);
		// with a cursor = stream offsets; without = state checkpoints
		expect(clientMessage.safeParse({
			type: 'play:watch', token: 't', next: 3,
		}).success).toBe(true);
		expect(clientMessage.safeParse({
			type: 'play:watch', token: 't',
		}).success).toBe(true);
		expect(clientMessage.safeParse({ type: 'play:unwatch' }).success).toBe(true);
		expect(clientMessage.safeParse({
			type: 'play:skip', token: 't',
		}).success).toBe(true);
		expect(clientMessage.safeParse({
			type: 'play:abort', token: 't',
		}).success).toBe(true);
		expect(clientMessage.safeParse({
			type: 'play:result', token: 't', forceSee: true,
		}).success).toBe(true);
		// a negative offsets cursor is rejected
		expect(clientMessage.safeParse({
			type: 'play:watch', token: 't', next: -1,
		}).success).toBe(false);
	});

	it('round-trips a ranked start result', () => {
		const msg = {
			type: 'play:start' as const,
			result: {
				status: 'ranked' as const,
				ruleset: 'mania4k' as const,
				joined: false,
				token: 't',
				beatmapId: 42,
				rate: 1.25,
				mods: ['HR', 'SD'],
				startedAt: 1_700_000_000_000,
				endsAt: 1_700_000_120_000,
				serverNow: 1_700_000_000_050,
				fatigue: 0.4,
				warmup: 0.6,
				warmupBar: 0.7,
				offsets: [
					{ id: 'n1' },
					{
						id: 'n2', tail: true as const, offset: -12.5,
					},
				],
				next: 2,
				done: false,
			},
		};
		expect(serverMessage.parse(msg)).toEqual(msg);
	});

	it('round-trips each play state phase', () => {
		const active = {
			type: 'play:state' as const,
			state: {
				phase: 'active' as const,
				token: 't',
				beatmapId: 42,
				rate: 1.25,
				mods: [],
				startedAt: 1_700_000_000_000,
				endsAt: 1_700_000_120_000,
				serverNow: 1_700_000_060_000,
				accuracy: 0.987,
				grade: 'S' as const,
			},
		};
		expect(serverMessage.parse(active)).toEqual(active);
		const finished = {
			type: 'play:state' as const,
			state: {
				phase: 'finished' as const, token: 't', notify: true,
			},
		};
		expect(serverMessage.parse(finished)).toEqual(finished);
		const idle = {
			type: 'play:state' as const,
			state: { phase: 'idle' as const },
		};
		expect(serverMessage.parse(idle)).toEqual(idle);
	});

	it('round-trips a play result (ok and refusal)', () => {
		const refused = {
			type: 'play:result' as const,
			token: 't',
			result: {
				ok: false as const, reason: 'tooSoon' as const,
			},
		};
		expect(serverMessage.parse(refused)).toEqual(refused);
		expect(serverMessage.safeParse({
			type: 'play:result',
			token: 't',
			result: {
				ok: false, reason: 'not-a-reason',
			},
		}).success).toBe(false);
	});

	it('accepts profile deltas on an ok result', () => {
		const ok = {
			type: 'play:result' as const,
			token: 't',
			result: {
				ok: true as const,
				failed: false,
				deltas: {
					rank: 3, rankedScore: 123456, pp: 12.34,
				},
			},
		};
		expect(serverMessage.parse(ok)).toEqual(ok);
		// rank must be an integer
		expect(serverMessage.safeParse({
			...ok,
			result: {
				...ok.result,
				deltas: {
					rank: 1.5, rankedScore: 0, pp: 0,
				},
			},
		}).success).toBe(false);
	});
});

describe('first-place announcement', () => {
	const beatmap = {
		artist: 'Camellia', title: 'Ghost', version: 'Insane',
	};

	it('formats a regular #1', () => {
		expect(firstPlaceMessage('Adri', beatmap, false))
			.toBe('Adri achieved rank #1 on Camellia - Ghost [Insane]');
	});

	it('formats a perfect (1M) #1', () => {
		expect(firstPlaceMessage('Adri', beatmap, true))
			.toBe('Adri achieved a perfect rank #1 on Camellia - Ghost [Insane]');
	});
});

describe('skill level announcement', () => {
	it('formats a milestone', () => {
		expect(skillLevelMessage('Adri', 'Jack Speed', 40))
			.toBe('Adri has reached Jack Speed level 40 !');
	});

	it('announces every 10th level, then every level from 100', () => {
		const milestones = [];
		for (let level = 1; level <= 105; level++) {
			if (isSkillLevelMilestone(level)) milestones.push(level);
		}
		expect(milestones).toEqual([
			10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 101, 102, 103, 104, 105,
		]);
	});
});
