import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import { countryName } from '@oss-idle/shared/display/country';
import {
	type Group,
	GROUP_BADGE,
} from '@oss-idle/shared/groups';

const asset = (path: string) => new URL(`../../${path}`, import.meta.url);
const pngUrl = (path: string) =>
	`data:image/png;base64,${readFileSync(asset(path)).toString('base64')}`;

const FONTS = ['Regular', 'SemiBold', 'Bold']
	.map(w => fileURLToPath(asset(`client/public/fonts/Exo2-${w}.otf`)));

const PINK = '#ff66ab';
const LIGHT = '#d8d3df';
const NAME_X = 380;
const BADGE_STEP = 92;

export type ProfileCard = {
	name: string;
	title?: string;
	avatarUrl: string;
	bannerUrl?: string;
	country: string;
	groups: Group[];
	globalRank?: number;
	countryRank?: number;
	pp: number;
	playCount: number;
};

const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

const num = (n: number) => Math.round(n).toLocaleString('en-US');

const rank = (n?: number) => (n ? `#${num(n)}` : '-');

/** The image type its first bytes say: servers label some PNGs as JPEG, which draws nothing. */
const imageType = (bytes: Buffer, label: string) => {
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
	return label;
};

/** An image as a data URL, undefined when it cannot be fetched. */
export const inline = async (url?: string): Promise<string | undefined> => {
	if (!url) return undefined;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return undefined;
		const bytes = Buffer.from(await res.arrayBuffer());
		const type = imageType(bytes, res.headers.get('content-type') ?? 'image/png');
		return `data:${type};base64,${bytes.toString('base64')}`;
	} catch {
		return undefined;
	}
};

const flag = (country: string) => {
	try {
		return pngUrl(`web/public/img/flags/${country.toUpperCase()}.png`);
	} catch {
		return undefined;
	}
};

/** The banner, else the avatar blurred to a wash, under a shade that keeps the text readable. */
const backdrop = (banner?: string, avatar?: string) => {
	const src = banner ?? avatar;
	return `
	<defs>
		<filter id="blur"><feGaussianBlur stdDeviation="${banner ? 6 : 40}"/></filter>
		<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#0f0d11" stop-opacity="0.55"/>
			<stop offset="0.6" stop-color="#0f0d11" stop-opacity="0.92"/>
		</linearGradient>
	</defs>
	<rect width="1200" height="630" fill="#1a1720"/>
	${src ? `<image href="${src}" x="-60" y="-60" width="1320" height="750"
		preserveAspectRatio="xMidYMid slice" filter="url(#blur)"/>` : ''}
	<rect width="1200" height="630" fill="url(#shade)"/>`;
};

const avatarImage = (avatar?: string) => `
	<clipPath id="avatar"><rect x="80" y="100" width="260" height="260" rx="40"/></clipPath>
	<rect x="80" y="100" width="260" height="260" rx="40" fill="#2a2530"/>
	${avatar ? `<image href="${avatar}" x="80" y="100" width="260" height="260"
		preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>` : ''}`;

/** Group badges then the title, osu!'s line under the name; empty without either. */
const titleLine = (groups: Group[], title?: string) => {
	const badges = groups.map((g, i) => {
		const x = NAME_X + i * BADGE_STEP;
		return `
		<rect x="${x}" y="232" width="80" height="34" rx="17" fill="${GROUP_BADGE[g].colour}"/>
		<text x="${x + 40}" y="257" font-size="22" font-weight="700" fill="#1a1720"
			text-anchor="middle">${GROUP_BADGE[g].short}</text>`;
	}).join('');
	const colour = groups[0] ? GROUP_BADGE[groups[0]].colour : LIGHT;
	return badges + (title ? `<text x="${NAME_X + groups.length * BADGE_STEP}" y="259" font-size="30"
		font-weight="600" fill="${colour}">${esc(title)}</text>` : '');
};

const countryLine = (country: string, y: number) => {
	const src = flag(country);
	return `
	${src ? `<image href="${src}" x="${NAME_X}" y="${y}" width="48" height="32"/>` : ''}
	<text x="${src ? NAME_X + 62 : NAME_X}" y="${y + 27}" font-size="30"
		fill="${LIGHT}">${esc(countryName(country))}</text>`;
};

const identity = (card: ProfileCard) => {
	const title = titleLine(card.groups, card.title);
	return `
	<text x="${NAME_X}" y="200" font-size="76" font-weight="700" fill="#fff">${esc(card.name)}</text>
	${title}
	${countryLine(card.country, title ? 300 : 240)}`;
};

const stat = (x: number, label: string, value: string) => `
	<text x="${x}" y="470" font-size="24" fill="#a59fb0">${esc(label)}</text>
	<text x="${x}" y="522" font-size="48" font-weight="700" fill="#fff">${esc(value)}</text>`;

const stats = (card: ProfileCard) => [
	stat(80, 'Global Ranking', rank(card.globalRank)),
	stat(380, 'Country Ranking', rank(card.countryRank)),
	stat(680, 'pp', num(card.pp)),
	stat(900, 'Play Count', num(card.playCount)),
].join('');

const footer = `
	<text x="1120" y="64" font-size="22" fill="#fff" fill-opacity="0.45"
		text-anchor="end">oss.idle.rhythmgamers.net</text>
	<rect y="620" width="1200" height="10" fill="${PINK}"/>`;

/** The 1200×630 image a shared profile link unfurls into: the profile header in a card. */
export const renderProfileCard = async (card: ProfileCard): Promise<Buffer> => {
	const [avatar, banner] = await Promise.all([inline(card.avatarUrl), inline(card.bannerUrl)]);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="Exo 2">
	${backdrop(banner, avatar)}
	${avatarImage(avatar)}
	${identity(card)}
	${stats(card)}
	${footer}
</svg>`;
	return new Resvg(svg, {
		font: {
			fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Exo 2',
		},
	}).render().asPng();
};
