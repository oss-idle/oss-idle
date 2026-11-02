import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import {
	BOT_GRAPH_LINE,
	BOT_GRAPH_SIZE,
	botGraph,
	type BotMatchRanks,
	type BotMatchResult,
	type BotTopScore,
	levelColour,
} from '@oss-idle/shared/botMatch';
import { skillName } from '@oss-idle/shared/rulesets/mania/4k/display';

import { inline } from './profileCard';

const FONTS = ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold']
	.map(w => fileURLToPath(new URL(`../../client/public/fonts/Exo2-${w}.otf`, import.meta.url)));

const TEXT = '#f6f0f5';
const DIM = 'rgba(246,240,245,.62)';
const GREEN = '#a3e07f';
const PINK = '#ff66ab';
const STARS = 90;
const CARD = {
	width: 1200, height: 630,
};
/** The column beside the graph. */
const SIDE = {
	x: 660, right: 1170,
};
const ROW = {
	top: 176, height: 88, cover: 118, gap: 8,
};
const TITLE_CHARS = 19;

const esc = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const num = (n: number) => Math.round(n).toLocaleString('en-US');

/** A level by the rules of levelDisplay: plain under 100, its colour and thin decimals from there. */
const levelText = (level: number, size: number) => {
	const whole = Math.floor(level);
	const colour = levelColour(level);
	if (!colour) return `<tspan font-size="${size}" fill="#fff">${whole}</tspan>`;
	const part = Math.floor((level - whole) * 100);
	const decimals = part > 0
		? `<tspan font-size="${size * 0.62}" font-weight="300" fill="${colour}"
			fill-opacity="${0.5 + 0.5 * part / 100}">.${String(part).padStart(2, '0')}</tspan>`
		: '';
	return `<tspan font-size="${size}" font-weight="600" fill="${colour}">${whole}</tspan>${decimals}`;
};

const stars = () => {
	let seed = 5;
	const next = () => (seed = seed * 16807 % 2147483647) / 2147483647;
	return Array.from({ length: STARS }, () => `<circle
		cx="${(next() * CARD.width).toFixed(0)}" cy="${(next() * CARD.height).toFixed(0)}"
		r="${(0.6 + next() * 0.9).toFixed(1)}" fill="#fff"
		fill-opacity="${(0.1 + next() * 0.3).toFixed(2)}"/>`).join('');
};

const skillLevel = (level: number, x: number, y: number, rank?: number) => `<text
	x="${x.toFixed(1)}" y="${(y + 10).toFixed(1)}" text-anchor="middle"
>${levelText(level, 30)}</text>
${rank ? `<text x="${x.toFixed(1)}" y="${(y + 32).toFixed(1)}" text-anchor="middle" font-size="17"
	fill="${DIM}">#${num(rank)}</text>` : ''}`;

const graph = ({ levels, overall }: BotMatchResult, ranks?: BotMatchRanks) => {
	const { cx, cy } = BOT_GRAPH_SIZE;
	const parts = botGraph(levels, skillName);
	return `${parts.map(({ arc, step, colour }) => `
		<path d="${step}" fill="none" stroke="${BOT_GRAPH_LINE}" stroke-opacity=".55"
			stroke-width="3"/>
		<path d="${arc}" fill="none" stroke="${colour}" stroke-width="7"
			stroke-linecap="round"/>`).join('')}
	${parts.map(({ skill, labelPath }) => `<path
		id="label-${skill}" d="${labelPath}" fill="none"/>`).join('')}
	${parts.map(({ skill, name }) => `<text
		text-anchor="middle" font-size="23" fill="${TEXT}"
	><textPath href="#label-${skill}" startOffset="50%">${esc(name)}</textPath></text>`).join('')}
	${parts.map(({ skill, number }) =>
		skillLevel(levels[skill] ?? 0, number.x, number.y, ranks?.skills[skill])).join('')}
	<text x="${cx}" y="${cy + 12}" text-anchor="middle">${levelText(overall, 50)}</text>
	${ranks ? `<text x="${cx}" y="${cy + 42}" text-anchor="middle" font-size="24"
		fill="${DIM}">#${num(ranks.overall)}</text>` : ''}`;
};

const gradeImage = (grade: string) => `data:image/svg+xml;base64,${readFileSync(
	new URL(`../../web/public/img/grade/grade-${grade}.svg`, import.meta.url),
).toString('base64')}`;

const clipped = (text: string) =>
	(text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1)}…` : text);

const modsOf = ({ mods, rate }: BotTopScore) =>
	[...mods, ...rate === 1 ? [] : [`x${rate}`], ''].join(' ');

const scoreRow = async (score: BotTopScore, index: number) => {
	const y = ROW.top + index * ROW.height;
	const height = ROW.height - ROW.gap;
	const textX = SIDE.x + ROW.cover + 62;
	const cover = await inline(`https://assets.ppy.sh/beatmaps/${score.setId}/covers/list.jpg`);
	return `<rect x="${SIDE.x}" y="${y}" width="${SIDE.right - SIDE.x}" height="${height}"
		fill="#fff" fill-opacity=".065"/>
	<rect x="${SIDE.x}" y="${y}" width="3" height="${height}" fill="${PINK}"/>
	${cover ? `<image href="${cover}" x="${SIDE.x + 3}" y="${y}" width="${ROW.cover}" height="${height}"
		preserveAspectRatio="xMidYMid slice"/>` : ''}
	<image href="${gradeImage(score.grade)}" x="${SIDE.x + ROW.cover + 12}" y="${y + 22}"
		width="42" height="36"/>
	<text x="${textX}" y="${y + 32}" font-size="22" fill="${TEXT}">${esc(clipped(score.title))}</text>
	<text x="${textX}" y="${y + 60}" font-size="18" fill="${DIM}">${esc(clipped(score.version))}</text>
	<text x="${SIDE.right - 12}" y="${y + 32}" text-anchor="end" font-size="24" font-weight="600"
		fill="${TEXT}">${num(score.pp)}pp</text>
	<text x="${SIDE.right - 12}" y="${y + 60}" text-anchor="end" font-size="18"
		fill="${DIM}">${modsOf(score)}${(score.accuracy * 100).toFixed(2)}%</text>`;
};

/** The 1200×630 image a shared match unfurls into. */
export const renderBotMatchCard = async (
	result: BotMatchResult, ranks?: BotMatchRanks,
): Promise<Buffer> => {
	const avatar = await inline(result.avatarUrl);
	const rows = await Promise.all(result.top.map(scoreRow));
	const rank = result.rank
		? `#${num(result.rank)}${result.pp ? `, ${num(result.pp)}pp` : ''}`
		: '';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" font-family="Exo 2">
	<defs>
		<radialGradient id="glow">
			<stop offset="0" stop-color="#ff3d89" stop-opacity=".18"/>
			<stop offset="1" stop-color="#ff3d89" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#0e0c14"/>
			<stop offset="1" stop-color="#0a090c"/>
		</linearGradient>
		<clipPath id="avatar"><rect x="${SIDE.x}" y="24" width="84" height="84" rx="20"/></clipPath>
	</defs>
	<rect width="${CARD.width}" height="${CARD.height}" fill="url(#base)"/>
	<circle cx="${BOT_GRAPH_SIZE.cx}" cy="${BOT_GRAPH_SIZE.cy}" r="430" fill="url(#glow)"/>
	${stars()}
	${graph(result, ranks)}
	${avatar ? `<image href="${avatar}" x="${SIDE.x}" y="24" width="84" height="84"
		preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar)"/>` : ''}
	<text x="${SIDE.x + 100}" y="66" font-size="46" font-weight="300"
		fill="#fff">${esc(result.username)}</text>
	<text x="${SIDE.x + 100}" y="102" font-size="24" fill="${DIM}">${rank}</text>
	<text x="${SIDE.right}" y="50" text-anchor="end" font-size="26" font-weight="300"
		fill="${DIM}">oss!idle</text>
	${ranks ? `<text x="${SIDE.x}" y="154" font-size="25" fill="${TEXT}">Would be <tspan
		fill="${GREEN}" font-weight="600">#${num(ranks.performance)}</tspan> on oss!idle, with <tspan
		font-weight="600">${num(result.performance)}pp</tspan></text>` : ''}
	${rows.join('')}
</svg>`;
	return new Resvg(svg, {
		font: {
			fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Exo 2',
		},
	}).render().asPng();
};
