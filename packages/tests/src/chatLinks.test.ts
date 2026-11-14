import {
	describe,
	expect,
	it,
} from 'vitest';

import {
	mapLink,
	mentionableText,
	plainText,
	splitLinks,
} from '@oss-idle/client/components/community/chat/links';

describe('splitLinks', () => {
	it('leaves plain text alone', () => {
		expect(splitLinks('node.js and foo@bar.com')).toEqual(['node.js and foo@bar.com']);
	});

	it('links http(s) and www. addresses', () => {
		expect(splitLinks('see https://osu.ppy.sh/b/1 or www.example.com')).toEqual([
			'see ',
			{
				text: 'https://osu.ppy.sh/b/1', url: 'https://osu.ppy.sh/b/1', 
			},
			' or ',
			{
				text: 'www.example.com', url: 'https://www.example.com/', 
			},
		]);
	});

	it('keeps sentence punctuation and unopened brackets out', () => {
		expect(splitLinks('(look at https://a.com/x).')).toEqual([
			'(look at ',
			{
				text: 'https://a.com/x', url: 'https://a.com/x', 
			},
			').',
		]);
		expect(splitLinks('https://en.wikipedia.org/wiki/Osu!_(game)')[0]).toEqual({
			text: 'https://en.wikipedia.org/wiki/Osu!_(game)',
			url: 'https://en.wikipedia.org/wiki/Osu!_(game)',
		});
	});

	it('opens a lookalike host under its real name', () => {
		expect(splitLinks('https://раураl.com')[0]).toMatchObject({ url: 'https://xn--l-7sba6dbr.com/' });
	});

	it('skips addresses without a real host', () => {
		expect(splitLinks('www. or http://localhost')).toEqual(['www. or http://localhost']);
	});

	it('reads the map /np sends, bracketed difficulty included', () => {
		const np = mapLink('https://site', {
			setId: 12, beatmapId: 345, 
		}, 'A - B [Insane]');
		expect(np).toBe('[https://site/web/maps/12?diff=345 A - B [Insane]]');
		expect(splitLinks(`np ${np} and https://a.com`)).toEqual([
			'np ',
			{
				text: 'A - B [Insane]', map: {
					setId: 12, beatmapId: 345, 
				}, 
			},
			' and ',
			{
				text: 'https://a.com', url: 'https://a.com/', 
			},
		]);
	});

	it('leaves other bracketed addresses as plain links', () => {
		expect(splitLinks('[https://a.com/web/maps/1 x]')).toEqual([
			'[',
			{
				text: 'https://a.com/web/maps/1', url: 'https://a.com/web/maps/1', 
			},
			' x]',
		]);
	});
});

describe('plainText', () => {
	it('shows a map by its label and keeps addresses as written', () => {
		const np = mapLink('http://localhost:5175', {
			setId: 882805, beatmapId: 1846628,
		}, 'aran - L.F.O [Beginner]');
		expect(plainText(`${np} see https://a.com`)).toBe('aran - L.F.O [Beginner] see https://a.com');
	});
});

describe('mentionableText', () => {
	it('drops maps, addresses and quiet parts, keeps the rest', () => {
		const np = mapLink('https://site', {
			setId: 1, beatmapId: 2,
		}, 'Kasane Teto - Song [Hard]');
		expect(mentionableText(`hi ${np} https://teto.com`)).not.toMatch(/teto/i);
		const map = 'Kasane Teto - Song [Hard]';
		expect(mentionableText(`Teto achieved rank #1 on ${map}`, [map]))
			.toBe('Teto achieved rank #1 on  ');
	});
});
