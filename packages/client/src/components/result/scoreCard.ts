import {
	ph,
	t,
} from '@lingui/core/macro';

import {
	type GlyphName,
	GLYPHS,
} from '@oss-idle/shared/achievements/glyphs';
import accuracy from '@oss-idle/shared/display/accuracy';
import { bigStyle } from '@oss-idle/shared/display/bigTheme';
import { MOD_LOOK } from '@oss-idle/shared/display/mods';
import num, { bignum } from '@oss-idle/shared/display/num';
import type { Mod } from '@oss-idle/shared/mods';
import type { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';

import { drawHpGraph } from '../../gameplay/drawHpGraph';
import { drawDevianceGraph } from '../../gameplay/hitError';
import type Skin from '../../osu/skin/Skin';
import { rateShort } from '../mods/rateShort';

export type ScoreCard = {
	title?: string,
	version?: string,
	creator?: string,
	background?: Promise<string | undefined>,
	gradeImage: string,
	playerName: string,
	playedAt: string,
	score: number,
	accuracy: number,
	maxCombo: number,
	pfc: boolean,
	/** none on a loved map */
	pp?: number,
	ur: number,
	rate: number,
	mods: Mod[],
	judges: { label: string, count: number, color: string }[],
	gains: Gain[],
	failed?: boolean,
	/** the replay's HP and deviance graphs, when there is one */
	graphs?: { game: ManiaGame, skin: Skin },
	/** the match's other players, best first */
	standings?: Standing[],
};

export type Gain = {
	name: string,
	/** the level reached, as the result screen shows it */
	level: string,
	levels: number,
	gained: number,
};

export type Standing = {
	name: string,
	score: number,
	combo: number,
	accuracy?: number,
	mods: string,
	failed: boolean,
	self: boolean,
};

const W = 1200;
const H = 630;
const PAD = 48;
const SITE = 'oss.idle.rhythmgamers.net';
/** where the graphs and the site's line end */
const BOTTOM = H - 28;
const PINK = '#ff66aa';
const GREY = '#b9b3c6';

const font = (weight: number, size: number) => `${weight} ${size}px "Exo 2", sans-serif`;

type Source = string | Promise<string | undefined> | undefined;

const loadImage = async (source: Source): Promise<ImageBitmap | undefined> => {
	const url = await source;
	if (!url) return undefined;
	try {
		const res = await fetch(url);
		return await createImageBitmap(await res.blob());
	} catch {
		return undefined;
	}
};

const fit = (ctx: CanvasRenderingContext2D, text: string, width: number): string => {
	if (ctx.measureText(text).width <= width) return text;
	let cut = text;
	while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
	return `${cut}…`;
};

type Icon = { glyph: GlyphName, color: string, short: string };

const SIDE = 760;
const SIDE_W = W - PAD - SIDE;
const LEFT_W = SIDE - PAD - 32;
const LINE = 26;
const ICON = 64;
/** how far each mod icon overlaps the one before it */
const ICON_STEP = 46;

const modIcons = (card: ScoreCard): Icon[] => {
	const icons: Icon[] = card.mods.map(mod => ({
		glyph: MOD_LOOK[mod].glyph, color: MOD_LOOK[mod].tint, short: mod,
	}));
	const short = rateShort(card.rate);
	if (card.rate > 1) icons.push({
		glyph: 'clock', color: '#8c4fd0', short, 
	});
	if (card.rate < 1) icons.push({
		glyph: 'hourglass', color: '#5b5b66', short, 
	});
	return icons;
};

/** The mods in one row, each tile tucked under the next as on osu!'s ranking screen. */
const drawMods = (ctx: CanvasRenderingContext2D, icons: Icon[], top: number) => {
	const width = ICON + (icons.length - 1) * ICON_STEP;
	icons.forEach((icon, i) => {
		ctx.save();
		ctx.translate(SIDE + (SIDE_W - width) / 2 + i * ICON_STEP + ICON / 2, top + ICON / 2);
		ctx.rotate(-6 * Math.PI / 180);
		ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
		ctx.shadowBlur = 10;
		ctx.fillStyle = icon.color;
		ctx.beginPath();
		ctx.roundRect(-ICON / 2, -ICON / 2, ICON, ICON, 6);
		ctx.fill();
		ctx.shadowColor = 'transparent';
		ctx.fillStyle = '#fff';
		ctx.font = font(800, 13);
		ctx.fillText(icon.short, -ICON / 2 + 5, ICON / 2 - 5);
		const glyph = 36;
		ctx.translate(-glyph / 2, -glyph / 2 - 4);
		ctx.scale(glyph / 256, glyph / 256);
		ctx.fill(new Path2D(GLYPHS[icon.glyph]));
		ctx.restore();
	});
};

const drawBackground = (ctx: CanvasRenderingContext2D, height: number, image?: ImageBitmap) => {
	ctx.fillStyle = '#17131f';
	ctx.fillRect(0, 0, W, height);
	if (image) {
		const scale = Math.max(W / image.width, height / image.height) * 1.1;
		ctx.filter = 'blur(14px)';
		ctx.drawImage(image, (W - image.width * scale) / 2, (height - image.height * scale) / 2,
			image.width * scale, image.height * scale);
		ctx.filter = 'none';
	}
	const shade = ctx.createLinearGradient(0, 0, W, 0);
	shade.addColorStop(0, 'rgba(12, 9, 18, 0.85)');
	shade.addColorStop(1, 'rgba(12, 9, 18, 0.65)');
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, W, height);
};

/** Title [version], then the mapper and the player, as the result screen's title bar. */
const drawHeader = (ctx: CanvasRenderingContext2D, card: ScoreCard) => {
	const title = card.title ?? t`Result`;
	const version = card.version ? ` [${card.version}]` : '';
	// shrink before cutting, so most titles keep their version on the line
	let size = 38;
	const width = () => {
		ctx.font = font(900, size);
		const titleWidth = ctx.measureText(title).width;
		ctx.font = font(700, size * 0.8);
		return titleWidth + ctx.measureText(version).width;
	};
	while (size > 28 && width() > LEFT_W) size -= 2;
	ctx.font = font(700, size * 0.8);
	const versionWidth = Math.min(ctx.measureText(version).width, LEFT_W / 2);
	ctx.fillStyle = '#fff';
	ctx.font = font(900, size);
	const shown = fit(ctx, title, LEFT_W - versionWidth);
	ctx.fillText(shown, PAD, 64);
	const x = PAD + ctx.measureText(shown).width;
	ctx.fillStyle = PINK;
	ctx.font = font(700, size * 0.8);
	ctx.fillText(fit(ctx, version, PAD + LEFT_W - x), x, 64);

	ctx.fillStyle = GREY;
	if (card.creator) {
		ctx.font = font(500, 20);
		ctx.fillText(fit(ctx, t`Beatmap by ${ph({ creator: card.creator })}`, LEFT_W), PAD, 94);
	}
	ctx.font = font(500, 18);
	const { playerName, playedAt } = card;
	const played = fit(ctx, t`Played by ${ph({ playerName })} on ${ph({ playedAt })}`, LEFT_W);
	ctx.fillText(played, PAD, card.creator ? 120 : 94);
};

const JUDGES_Y = 252;
const JUDGE_ROW = 38;

/** Draws the score panel, returning where it ends. */
const drawScore = (ctx: CanvasRenderingContext2D, card: ScoreCard): number => {
	ctx.fillStyle = '#fff';
	ctx.font = font(700, 80);
	ctx.letterSpacing = '6px';
	ctx.textAlign = 'right';
	// letter spacing also trails the last digit
	ctx.fillText(Math.round(card.score).toString().padStart(7, '0'), PAD + 610 + 6, 200);
	ctx.textAlign = 'left';
	ctx.letterSpacing = '0px';

	// an odd last one sits on the right, as on the result screen
	const right = (i: number) => i % 2 === 1 || i === card.judges.length - 1;
	card.judges.forEach((j, i) => {
		const x = PAD + (right(i) ? 330 : 0);
		const y = JUDGES_Y + Math.floor(i / 2) * JUDGE_ROW;
		ctx.textAlign = 'left';
		ctx.fillStyle = j.color;
		ctx.font = font(900, 24);
		ctx.fillText(j.label, x, y);
		ctx.textAlign = 'right';
		ctx.fillStyle = '#fff';
		ctx.font = font(700, 30);
		ctx.fillText(j.count.toString(), x + 280, y);
	});
	ctx.textAlign = 'left';

	const stats: [string, string][] = [
		[t`Performance`, card.pp === undefined ? '—' : `${num(card.pp)}pp`],
		[t`Combo`, `${card.maxCombo}x${card.pfc ? ' PFC' : ''}`],
		[t`Accuracy`, accuracy(card.accuracy)],
		['UR', card.ur.toFixed(2)],
	];
	const top = JUDGES_Y + (Math.ceil(card.judges.length / 2) - 1) * JUDGE_ROW + 50;
	let x = PAD;
	for (const [label, value] of stats) {
		ctx.fillStyle = GREY;
		ctx.font = font(700, 15);
		ctx.letterSpacing = '3px';
		const labelWidth = ctx.measureText(label.toUpperCase()).width;
		ctx.fillText(label.toUpperCase(), x, top);
		ctx.letterSpacing = '0px';
		ctx.fillStyle = '#fff';
		ctx.font = font(900, 34);
		ctx.fillText(value, x, top + 40);
		x += Math.max(labelWidth, ctx.measureText(value).width) + 44;
	}
	return top + 58;
};

const GRAPH_GAP = 16;
const CAPTION = 26;

/** HP and hit deviance side by side under the score, as under the result screen's panel. */
const drawGraphs = (
	ctx: CanvasRenderingContext2D,
	{ game, skin }: NonNullable<ScoreCard['graphs']>,
	top: number,
) => {
	const width = (LEFT_W - GRAPH_GAP) / 2;
	const height = BOTTOM - top - CAPTION;
	const graphs: [string, (g: CanvasRenderingContext2D) => void][] = [
		['HP', g => drawHpGraph(g, {
			hits: game.hits,
			songEndMs: game.songEndMs,
			width,
			height,
			lowThreshold: skin.data.hpBar.lowThreshold,
		})],
		[t`Hit deviance`, g => drawDevianceGraph(skin, g, {
			hits: game.hits,
			windows: game.windows,
			songEndMs: game.songEndMs,
			width,
			height,
		})],
	];
	graphs.forEach(([label, draw], i) => {
		const x = PAD + i * (width + GRAPH_GAP);
		ctx.fillStyle = GREY;
		ctx.font = font(700, 13);
		ctx.letterSpacing = '3px';
		ctx.fillText(label.toUpperCase(), x, top + 16);
		ctx.letterSpacing = '0px';
		// each graph clears its own canvas
		const graph = document.createElement('canvas');
		graph.width = width;
		graph.height = height;
		draw(graph.getContext('2d')!);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
		ctx.beginPath();
		ctx.roundRect(x, top + CAPTION, width, height, 6);
		ctx.fill();
		ctx.drawImage(graph, x, top + CAPTION);
	});
};

const drawGains = (ctx: CanvasRenderingContext2D, gains: Gain[], top: number) => {
	gains.forEach((g, i) => {
		const y = top + i * LINE;
		ctx.fillStyle = '#fff';
		ctx.font = font(600, 18);
		ctx.fillText(g.name, SIDE, y);
		ctx.font = font(700, 18);
		const level = `Lv ${g.level}`;
		ctx.fillText(level, SIDE + 150, y);
		if (g.levels > 0) {
			ctx.fillStyle = '#ffd24a';
			ctx.fillText(` ▲${g.levels}`, SIDE + 150 + ctx.measureText(level).width, y);
		}
		ctx.textAlign = 'right';
		ctx.fillStyle = PINK;
		ctx.fillText('xp', W - PAD, y);
		const at = W - PAD - ctx.measureText('xp').width;
		const amount = bignum(g.gained);
		ctx.fillStyle = bigStyle(g.gained, 'heat')?.color ?? PINK;
		ctx.fillText(amount, at, y);
		ctx.fillStyle = PINK;
		ctx.fillText('+', at - ctx.measureText(amount).width, y);
		ctx.textAlign = 'left';
	});
};

const drawFailed = (ctx: CanvasRenderingContext2D, centre: number) => {
	ctx.save();
	ctx.font = font(900, 76);
	ctx.textAlign = 'center';
	ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
	ctx.shadowBlur = 18;
	ctx.fillStyle = '#ff4b5c';
	ctx.fillText(t`FAILED`, SIDE + SIDE_W / 2, centre + 26);
	ctx.restore();
};

/** Grade, mods and xp gains, stacked up from the bottom. */
const drawSide = (ctx: CanvasRenderingContext2D, card: ScoreCard, grade?: ImageBitmap) => {
	const gains = card.gains.slice(0, 3);
	// the site's line sits under them
	const gainsTop = BOTTOM - 30 - (gains.length - 1) * LINE;
	drawGains(ctx, gains, gainsTop);

	const icons = modIcons(card);
	let bottom = gainsTop - 32;
	if (icons.length) {
		bottom -= ICON;
		drawMods(ctx, icons, bottom);
		bottom -= 16;
	}

	const top = 36;
	if (grade) {
		const h = Math.min(440, bottom - top);
		const w = Math.min(SIDE_W, grade.width * h / grade.height);
		ctx.drawImage(grade, SIDE + (SIDE_W - w) / 2, top, w, h);
	}
	if (card.failed) drawFailed(ctx, (top + bottom) / 2);
};

const ROW_H = 44;

const drawStandings = (ctx: CanvasRenderingContext2D, standings: Standing[]) => {
	standings.forEach((s, i) => {
		const y = H + i * ROW_H;
		const mid = y + ROW_H / 2 + 8;
		const stripe = `rgba(255, 255, 255, ${i % 2 ? 0.03 : 0.07})`;
		ctx.fillStyle = s.self ? 'rgba(255, 102, 170, 0.18)' : stripe;
		ctx.beginPath();
		ctx.roundRect(PAD - 16, y + 3, W - PAD * 2 + 32, ROW_H - 6, 6);
		ctx.fill();

		ctx.font = font(900, 22);
		ctx.fillStyle = s.self ? PINK : GREY;
		ctx.fillText(`#${i + 1}`, PAD, mid);
		ctx.fillStyle = '#fff';
		ctx.font = font(700, 22);
		ctx.fillText(fit(ctx, s.name, 330), PAD + 64, mid);

		ctx.textAlign = 'right';
		ctx.font = font(700, 22);
		ctx.fillText(Math.round(s.score).toLocaleString('en-US'), PAD + 590, mid);
		ctx.font = font(600, 20);
		ctx.fillStyle = GREY;
		if (s.accuracy !== undefined) ctx.fillText(accuracy(s.accuracy), PAD + 730, mid);
		ctx.fillText(`${s.combo}x`, PAD + 850, mid);
		ctx.textAlign = 'left';
		ctx.fillText(s.mods, PAD + 880, mid);
		if (s.failed) {
			ctx.textAlign = 'right';
			ctx.fillStyle = '#ff4b5c';
			ctx.font = font(900, 18);
			ctx.fillText(t`FAILED`, W - PAD, mid);
			ctx.textAlign = 'left';
		}
	});
};

const drawSite = (ctx: CanvasRenderingContext2D, height: number) => {
	ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
	ctx.font = font(500, 16);
	ctx.textAlign = 'right';
	ctx.fillText(SITE, W - PAD, height - (H - BOTTOM));
	ctx.textAlign = 'left';
};

/** The result screen as an image to share: 1200x630, taller with a match's standings. */
export const drawScoreCard = async (card: ScoreCard): Promise<HTMLCanvasElement> => {
	await Promise.all([font(400, 20), font(500, 20), font(600, 20), font(700, 20), font(900, 20)]
		.map(f => document.fonts.load(f)));
	const [background, grade] = await Promise.all([
		loadImage(card.background),
		loadImage(card.gradeImage),
	]);
	const canvas = document.createElement('canvas');
	const standings = card.standings ?? [];
	const height = standings.length ? H + standings.length * ROW_H + 64 : H;
	canvas.width = W;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	drawBackground(ctx, height, background);
	drawHeader(ctx, card);
	const scoreBottom = drawScore(ctx, card);
	if (card.graphs) drawGraphs(ctx, card.graphs, scoreBottom);
	drawSide(ctx, card, grade);
	drawStandings(ctx, standings);
	drawSite(ctx, height);
	return canvas;
};

export const toPng = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) =>
	canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png'));
