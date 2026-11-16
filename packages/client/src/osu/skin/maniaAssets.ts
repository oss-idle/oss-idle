import {
	findImage,
	type FoundImage,
} from '@oss-idle/shared/osuSkin/files';
import type { Rgba } from '@oss-idle/shared/osuSkin/ini';
import { versionNumber } from '@oss-idle/shared/osuSkin/ini';
import {
	columnType,
	type ManiaConfig,
	maniaConfig,
	NOTE_BODY,
} from '@oss-idle/shared/osuSkin/mania';
import {
	JUDGEMENT,
	type Judgement,
} from '@oss-idle/shared/rulesets/mania/judgement';

import type OsuSkin from './OsuSkin';
import {
	coveredSpan,
	type Fit,
	resident,
} from './OsuSkin';

/** A decoded element: its frames, and its size in stable's 768-high space (@2x halved). */
export type Sprite = {
	frames: CanvasImageSource[],
	w: number,
	h: number,
	frameMs: number,
	loop: boolean,
};

export type Glyph = { img: CanvasImageSource, w: number, h: number };

/** A number font (`score-0` ... `score-9`, comma, dot, percent). */
export type Font = {
	glyphs: Partial<Record<string, Glyph>>,
	overlap: number,
	/** the rows of `0` that show something, in units: a glyph can be a big canvas with the
	 *  digit in a corner */
	ink: { top: number, height: number },
};

export type ColumnAssets = {
	note?: Sprite,
	head?: Sprite,
	body?: Sprite,
	tail?: Sprite,
	/** the hold's pieces darkened, as a dropped hold shows them */
	dimHead?: Sprite,
	dimBody?: Sprite,
	dimTail?: Sprite,
	key?: Sprite,
	keyDown?: Sprite,
	/** the stage light, tinted with the column's light colour */
	light?: Sprite,
	/** what a hold stable never plays shows: the map's own tail image when it brings one, else
	 *  the note (they are fake notes, never meant to look like tails) */
	decoration?: { sprite: Sprite, note: boolean },
};

export type Scorebar = {
	bg?: Sprite,
	colour?: Sprite,
	marker?: Sprite,
	ki?: Sprite,
	kiDanger?: Sprite,
	kiDanger2?: Sprite,
};

/** Everything the playfield draws for one key count, decoded and ready. */
export type ManiaAssets = {
	keys: number,
	config: ManiaConfig,
	/** idle.ini: the stage in the middle of the screen */
	stageCentre: boolean,
	version: number,
	columns: ColumnAssets[],
	stageLeft?: Sprite,
	stageRight?: Sprite,
	stageBottom?: Sprite,
	stageHint?: Sprite,
	lightingN?: Sprite,
	lightingL?: Sprite,
	judgements: Partial<Record<Judgement, Sprite>>,
	/** before the first note, scrolling down the middle of the stage */
	warningArrow?: Sprite,
	/** shown beside the stage at each combo milestone, one image of the set at a time */
	comboBursts: Sprite[],
	combo: Font,
	/** the combo while a hold is held, and the one that pops off when it breaks */
	comboHold: Font,
	comboBreak: Font,
	score: Font,
	scorebar: Scorebar,
};

type Found = { skin: OsuSkin, frames: FoundImage[] };

/** The first of these (skin, name) that has the image. */
const first = (...chain: [OsuSkin, string | undefined][]): Found | undefined => {
	for (const [skin, name] of chain) {
		if (!name) continue;
		const frames = skin.frames(name);
		if (frames.length) return {
			skin, frames,
		};
	}
};

const sprite = async (
	found: Found | undefined,
	frameMs: (frames: number) => number,
	loop: boolean,
	fit: Fit = 'scale',
): Promise<Sprite | undefined> => {
	if (!found) return undefined;
	const decoded = (await Promise.all(found.frames.map(f => found.skin.bitmap(f.path, fit))))
		.filter(b => b !== undefined);
	if (!decoded.length) return undefined;
	const density = found.frames[0].density;
	return {
		frames: decoded.map(d => d.img),
		w: decoded[0].w / density,
		h: decoded[0].h / density,
		frameMs: frameMs(decoded.length),
		loop,
	};
};

const decoration = (
	tail: Sprite | undefined, note: Sprite | undefined,
): ColumnAssets['decoration'] => {
	if (tail) return {
		sprite: tail, note: false,
	};
	return note && {
		sprite: note, note: true,
	};
};

const SIXTY = 1000 / 60;
const sixty = () => SIXTY;

/** Multiply an image's colour by `rgba` (alpha too), as stable tints a sprite. */
type Sized = CanvasImageSource & { width: number, height: number };

const tintImage = (img: Sized, [r, g, b, a]: Rgba) => {
	const canvas = new OffscreenCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0);
	ctx.globalCompositeOperation = 'multiply';
	ctx.fillStyle = `rgb(${r},${g},${b})`;
	ctx.fillRect(0, 0, img.width, img.height);
	// multiply paints the transparent parts too: cut back to the image's own shape
	ctx.globalCompositeOperation = 'destination-in';
	ctx.globalAlpha = Math.max(1, a) / 255;
	ctx.drawImage(img, 0, 0);
	return canvas.transferToImageBitmap();
};

const isWhite = ([r, g, b, a]: Rgba) => r === 255 && g === 255 && b === 255 && a === 255;

const tint = (s: Sprite | undefined, colour: Rgba): Sprite | undefined => {
	if (!s || isWhite(colour)) return s;
	return {
		...s, frames: s.frames.map(f => tintImage(f as ImageBitmap, colour)),
	};
};

const DARK_GRAY: Rgba = [169, 169, 169, 255];

/** An image drawn additively, made to add the same light onto our see-through canvas: its
 *  black turns transparent (the brightest channel becomes the alpha), so it leaves no box
 *  where nothing opaque is behind it. */
const lightImage = (img: Sized) => {
	const canvas = new OffscreenCanvas(img.width, img.height);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, 0, 0);
	const data = ctx.getImageData(0, 0, img.width, img.height);
	const px = data.data;
	for (let i = 0; i < px.length; i += 4) {
		const a = px[i + 3] / 255;
		const r = px[i] * a;
		const g = px[i + 1] * a;
		const b = px[i + 2] * a;
		const max = Math.max(r, g, b);
		if (max === 0) {
			px[i + 3] = 0;
			continue;
		}
		px[i] = r * 255 / max;
		px[i + 1] = g * 255 / max;
		px[i + 2] = b * 255 / max;
		px[i + 3] = max;
	}
	ctx.putImageData(data, 0, 0);
	// read back, the canvas may have left the GPU
	return resident(canvas.transferToImageBitmap());
};

const light = (s: Sprite | undefined): Sprite | undefined => s && {
	...s, frames: s.frames.map(f => lightImage(f as ImageBitmap)),
};

// what the HUD writes with them: no more is decoded
const FONT_CHARS: Record<string, string> = {
	',': 'comma', '.': 'dot', '%': 'percent',
};
for (let i = 0; i < 10; i++) FONT_CHARS[String(i)] = String(i);

const font = async (
	skin: OsuSkin,
	fallback: OsuSkin,
	prefix: string | undefined,
	overlap: number | undefined,
): Promise<Font> => {
	const own = findImage(skin, `${prefix ?? 'score'}-0`);
	// a font is the skin's whole, or the default's whole: never mixed glyph by glyph
	const from = own ? skin : fallback;
	const base = own ? prefix ?? 'score' : fallback.ini.fonts.scorePrefix ?? 'score';
	const glyphs: Partial<Record<string, Glyph>> = {};
	await Promise.all(Object.entries(FONT_CHARS).map(async ([char, name]) => {
		const found = findImage(from, `${base}-${name}`);
		const decoded = found && await from.bitmap(found.path);
		if (decoded) glyphs[char] = {
			img: decoded.img, w: decoded.w / found.density, h: decoded.h / found.density,
		};
	}));
	return {
		glyphs, overlap: own ? overlap ?? 0 : fallback.ini.fonts.scoreOverlap ?? 0, ink: ink(glyphs['0']),
	};
};

const ink = (g: Glyph | undefined): Font['ink'] => {
	if (!g) return {
		top: 0, height: 0,
	};
	const img = g.img as ImageBitmap;
	const ctx = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
	ctx.drawImage(img, 0, 0);
	const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
	const [top, bottom] = coveredSpan(data, width, height, true);
	if (top < 0) return {
		top: 0, height: g.h,
	};
	const k = g.h / height;
	return {
		top: top * k, height: (bottom + 1 - top) * k,
	};
};

const tintFont = (f: Font, colour: Rgba): Font => isWhite(colour) ? f : {
	...f,
	glyphs: Object.fromEntries(Object.entries(f.glyphs).map(([c, g]) => [c, g && {
		...g, img: tintImage(g.img as ImageBitmap, colour),
	}])),
};

/** Each judgement's skin.ini command and image name. */
export const HIT_COMMANDS: Record<Judgement, [string, string]> = {
	[JUDGEMENT.DIVINE]: ['HitDivine', 'mania-hitdivine'],
	[JUDGEMENT.MARVELOUS]: ['Hit300g', 'mania-hit300g'],
	[JUDGEMENT.PERFECT]: ['Hit300', 'mania-hit300'],
	[JUDGEMENT.GREAT]: ['Hit200', 'mania-hit200'],
	[JUDGEMENT.GOOD]: ['Hit100', 'mania-hit100'],
	[JUDGEMENT.BAD]: ['Hit50', 'mania-hit50'],
	[JUDGEMENT.MISS]: ['Hit0', 'mania-hit0'],
};

const lightingMs = (frames: number) => Math.max(SIXTY, 170 / frames);

const column = async (
	skin: OsuSkin, fallback: OsuSkin, cfg: ManiaConfig, c: number,
): Promise<ColumnAssets> => {
	const type = columnType(cfg.keys, c);
	const img = cfg.images;
	const fps = skin.ini.general.animationFramerate ?? 0;
	const noteMs = (frames: number) => fps > 0 ? 1000 / fps : 1000 / frames;
	const own = (command: string, name: string): [OsuSkin, string | undefined][] =>
		[[skin, img[command] ?? name]];
	const def = (name: string): [OsuSkin, string] => [fallback, name];
	const note = `mania-note${type}`;

	// a map's tail image comes by its standard name, whatever the player's skin.ini names
	const standard = first([skin, `${note}T`]);
	const mapTail = standard?.skin.fromMap(standard.frames[0].path) ? standard : undefined;
	const [noteS, head, body, tail, key, keyDown, light, mapTailS] = await Promise.all([
		sprite(first(...own(`NoteImage${c}`, note), def(note)), noteMs, true),
		sprite(first(
			...own(`NoteImage${c}H`, `${note}H`), ...own(`NoteImage${c}`, note), def(`${note}H`), def(note),
		), noteMs, true),
		sprite(first(...own(`NoteImage${c}L`, `${note}L`), def(`${note}L`)), () => 30, true,
			cfg.noteBodyStyle[c] === NOTE_BODY.STRETCH ? 'scale' : 'top'),
		sprite(first(
			...own(`NoteImage${c}T`, `${note}T`),
			...own(`NoteImage${c}H`, `${note}H`),
			...own(`NoteImage${c}`, note),
			def(`${note}T`), def(`${note}H`), def(note),
		), noteMs, true),
		sprite(first(...own(`KeyImage${c}`, `mania-key${type}`), def(`mania-key${type}`)), sixty, false),
		sprite(first(...own(`KeyImage${c}D`, `mania-key${type}D`), def(`mania-key${type}D`)), sixty, false),
		sprite(first(...own('StageLight', 'mania-stage-light'), def('mania-stage-light')),
			() => 1000 / cfg.lightFramePerSecond, true),
		sprite(mapTail, noteMs, true),
	]);
	return {
		note: noteS,
		head,
		body,
		tail,
		decoration: decoration(mapTailS, noteS),
		dimHead: tint(head, DARK_GRAY),
		dimBody: tint(body, DARK_GRAY),
		dimTail: tint(tail, DARK_GRAY),
		key,
		keyDown,
		light: tint(light, cfg.colours.light[c]),
	};
};

/** Decode what `skin` plays `keys` keys with; whatever it lacks comes from `fallback`, the
 *  default skin, the way stable falls back on its own. */
export const loadManiaAssets = async (
	skin: OsuSkin, fallback: OsuSkin, keys: number,
): Promise<ManiaAssets> => {
	const cfg = maniaConfig(skin.ini, keys);
	const img = cfg.images;
	const element = (command: string, name: string) =>
		first([skin, img[command] ?? name], [fallback, name]);
	const fonts = skin.ini.fonts;

	const [columns, stageLeft, stageRight, stageBottom, stageHint, lightingN, lightingL, combo, score] =
		await Promise.all([
			Promise.all(Array.from({ length: keys }, (_, c) => column(skin, fallback, cfg, c))),
			sprite(element('StageLeft', 'mania-stage-left'), sixty, false),
			sprite(element('StageRight', 'mania-stage-right'), sixty, false),
			sprite(element('StageBottom', 'mania-stage-bottom'), sixty, true),
			sprite(element('StageHint', 'mania-stage-hint'), sixty, false),
			sprite(element('LightingN', 'lightingN'), lightingMs, false).then(light),
			sprite(element('LightingL', 'lightingL'), lightingMs, true).then(light),
			font(skin, fallback, fonts.comboPrefix, fonts.comboOverlap),
			font(skin, fallback, fonts.scorePrefix, fonts.scoreOverlap),
		]);

	const judgements: Partial<Record<Judgement, Sprite>> = {};
	await Promise.all(Object.entries(HIT_COMMANDS).map(async ([j, [command, name]]) => {
		judgements[j as Judgement] = await sprite(element(command, name), () => 50, true);
	}));

	const [warningArrow, burstSet] = await Promise.all([
		sprite(element('WarningArrow', 'mania-warningarrow'), sixty, false),
		// before skin version 2.7, mania showed osu!'s combobursts
		sprite(first([skin, 'comboburst-mania'],
			[skin, versionNumber(skin.ini.general.version) < 2.7 ? 'comboburst' : undefined]), sixty, false),
	]);
	const comboBursts = burstSet?.frames.map(img => ({
		...burstSet, frames: [img],
		w: (img as ImageBitmap).width * burstSet.w / (burstSet.frames[0] as ImageBitmap).width,
		h: (img as ImageBitmap).height * burstSet.h / (burstSet.frames[0] as ImageBitmap).height,
	})) ?? [];

	// the bar is the skin's whole set or the default's
	const bar = skin.frames('scorebar-bg').length ? skin : fallback;
	const barFps = bar.ini.general.animationFramerate ?? 0;
	const barPart = (name: string) => sprite(first([bar, name]), sixty, false);
	const [bg, colour, marker, ki, kiDanger, kiDanger2] = await Promise.all([
		barPart('scorebar-bg'),
		sprite(first([bar, 'scorebar-colour']), n => barFps > 0 ? 1000 / barFps : 1000 / n, true),
		barPart('scorebar-marker'),
		barPart('scorebar-ki'),
		barPart('scorebar-kidanger'),
		barPart('scorebar-kidanger2'),
	]);

	return {
		keys,
		config: cfg,
		stageCentre: !!skin.idle.mania.find(m => m.keys === keys)?.stageCentre,
		version: versionNumber(skin.ini.general.version),
		columns,
		stageLeft,
		stageRight,
		stageBottom,
		stageHint,
		lightingN,
		lightingL,
		judgements,
		warningArrow,
		comboBursts,
		combo,
		comboHold: tintFont(combo, cfg.colours.hold),
		comboBreak: tintFont(combo, cfg.colours.break),
		score,
		scorebar: {
			bg, colour, marker, ki, kiDanger, kiDanger2,
		},
	};
};
