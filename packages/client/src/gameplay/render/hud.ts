import { BAR_ZONES } from '@oss-idle/shared/fatigue';
import { type Grade } from '@oss-idle/shared/grade';
import { MAX_HP } from '@oss-idle/shared/rulesets/mania/scoring';

import { drawHitErrorBar } from '../hitError';
import {
	type Frame,
	roundRect,
	type StrainHud,
	type Viewport,
} from './frame';
import type { StageFrame } from './stage';
import { makeStageHud } from './stageHud';

const HP_EASE_MS = 200;

const TRACK = 'rgba(255,255,255,0.12)';
const BAR_H = 4;

// the warm-up bar's zones, left to right: cold, the sweet spot, past the peak, fatigued
const ZONE_COLORS = ['#4da3ff', '#ffd34d', '#ff9a4d', '#b48cff'];

// spans the bar from the origin: cold blue, gold through the sweet spot, orange, fatigue purple
const warmupFills = new Map<number, CanvasGradient>();
const warmupFill = (ctx: CanvasRenderingContext2D, w: number) => {
	let fill = warmupFills.get(w);
	if (fill) return fill;
	const [peak, pushing, fatigued] = BAR_ZONES;
	fill = ctx.createLinearGradient(0, 0, w, 0);
	fill.addColorStop(0, ZONE_COLORS[0]);
	fill.addColorStop(peak, ZONE_COLORS[1]);
	fill.addColorStop(pushing, ZONE_COLORS[1]);
	fill.addColorStop(fatigued, ZONE_COLORS[2]);
	fill.addColorStop(1, ZONE_COLORS[3]);
	warmupFills.set(w, fill);
	return fill;
};

const zoneOf = (v: number) => {
	let i = 0;
	while (i < BAR_ZONES.length && v >= BAR_ZONES[i]) i++;
	return i;
};

// strain load, calm lavender → oss! pink → hot red, made once: the HUD allocates nothing per frame
const LOAD_STEPS = 32;
const mix = (p: number[], q: number[], k: number) =>
	p.map((c, i) => Math.round(c + (q[i] - c) * k));
const LOAD = Array.from({ length: LOAD_STEPS + 1 }, (_, i) => {
	const k = i / LOAD_STEPS;
	const [r, g, b] = k < 0.6
		? mix([150, 160, 255], [255, 102, 171], k / 0.6)
		: mix([255, 102, 171], [255, 64, 64], (k - 0.6) / 0.4);
	return `rgb(${r},${g},${b})`;
});
const load = (v: number) => LOAD[Math.round(Math.max(0, Math.min(1, v)) * LOAD_STEPS)];
// a skill's name brightens with its load
const NAME = Array.from({ length: 17 }, (_, i) =>
	`rgba(255,255,255,${(0.45 + 0.45 * i / 16).toFixed(3)})`);
const SHADOW = 'rgba(0,0,0,0.8)';

// a hit error bar for warm-up: the zones, a centre line, and a needle where the character sits
export const drawWarmupGauge = (
	f: Frame,
	label: string,
	state: string,
	v: number,
	bx: number,
	by: number,
	/** which way the map moves the needle, -3 cooling to 3 warming */
	trend = 0,
	w = 230,
) => {
	const { ctx } = f;
	const zone = zoneOf(v);
	const arrows = (trend > 0 ? '›' : '‹').repeat(Math.abs(trend));
	const arrowColor = ZONE_COLORS[trend > 0 ? 2 : 0];
	const font = ctx.font;
	ctx.shadowColor = SHADOW;
	ctx.shadowBlur = 3;
	// narrow: the state under the label, the way the map moves the needle beside it
	const narrow = w < 120;
	if (narrow) {
		ctx.textAlign = 'right';
		ctx.fillStyle = 'rgba(255,255,255,0.7)';
		ctx.fillText(label, bx + w, by);
		ctx.fillStyle = ZONE_COLORS[zone];
		ctx.fillText(state, bx + w, by + 13);
		const sx = bx + w - ctx.measureText(state).width - 4;
		ctx.font = '800 14px "Exo 2", sans-serif';
		ctx.fillStyle = arrowColor;
		ctx.fillText(arrows, sx, by + 13);
		ctx.font = font;
	} else {
		ctx.textAlign = 'left';
		ctx.fillStyle = 'rgba(255,255,255,0.7)';
		ctx.fillText(label, bx, by);
		ctx.textAlign = 'right';
		ctx.fillStyle = ZONE_COLORS[zone];
		ctx.fillText(state, bx + w, by);
	}
	ctx.shadowBlur = 0;
	const y = by + (narrow ? 20 : 7);
	ctx.save();
	ctx.translate(bx, y);
	ctx.fillStyle = warmupFill(ctx, w);
	ctx.globalAlpha = 0.9;
	roundRect(ctx, 0, 0, w, BAR_H, BAR_H / 2);
	ctx.fill();
	ctx.restore();
	ctx.fillStyle = 'rgba(255,255,255,0.55)';
	ctx.fillRect(bx + w / 2 - 0.5, y - 2, 1, BAR_H + 4);
	const x = bx + v * w;
	ctx.save();
	ctx.shadowColor = ZONE_COLORS[zone];
	ctx.shadowBlur = zone === 1 ? 8 + 4 * Math.sin(performance.now() / 250) : 6;
	ctx.fillStyle = '#fff';
	ctx.fillRect(x - 1, y - 3, 2, BAR_H + 6);
	ctx.beginPath();
	ctx.moveTo(x, y + BAR_H + 4);
	ctx.lineTo(x - 4, y + BAR_H + 10);
	ctx.lineTo(x + 4, y + BAR_H + 10);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
	if (!trend || narrow) return;
	// the way the map moves the needle, beside its tip on the side it heads to -
	// the other side when the bar ends first
	ctx.font = '800 14px "Exo 2", sans-serif';
	const aw = ctx.measureText(arrows).width;
	const right = trend > 0 ? x + 7 + aw <= bx + w : x - 7 - aw < bx;
	ctx.fillStyle = arrowColor;
	ctx.textAlign = right ? 'left' : 'right';
	ctx.fillText(arrows, right ? x + 7 : x - 7, y + BAR_H + 12);
	ctx.font = font;
};

type Size = Pick<Viewport, 'w' | 'h'>;

// the strain panel, right of the playfield: a sparkline per skill, its name right of it, the
// warm-up bar under them. Where that doesn't fit, each name stacks over its sparkline, as wide
// as the room left allows.
const SPARK_W = 140;
const NAME_W = 90;
const SPARK_H = 15;
const STACKED_MIN = 64;
const STACKED_H = 12;
// clear of the playfield's HP bar
const FIELD_GAP = 16;
const strainLayout = (vp: Size, fieldRight: number, gauges: number) => {
	const stacked = vp.w - 28 - (SPARK_W + NAME_W) < fieldRight + FIELD_GAP;
	const width = stacked
		? Math.max(STACKED_MIN, Math.min(SPARK_W, vp.w - 12 - fieldRight - FIELD_GAP))
		: SPARK_W + NAME_W;
	// stacked, as high as it goes: the warm-up bar stays clear of the HP bar's top
	const top = stacked ? 190 : Math.max(190, vp.h * 0.3);
	const row = stacked ? 35 : SPARK_H + 7;
	return {
		stacked,
		x: vp.w - (stacked ? 12 : 28) - width,
		top,
		row,
		width,
		spark: stacked ? width : SPARK_W,
		height: stacked ? STACKED_H : SPARK_H,
		/** the warm-up label's baseline */
		warmup: top + gauges * row + 16,
	};
};

// the sparklines' points across the whole song, each the hardest moment of its slice
const POINTS = 120;
const PER_POINT = 8;

/**
 * Every gauge's load over the whole song, read from the strain analysis (done for the whole
 * map before the play, or streamed with a server play's replay): arriving mid-play shows
 * everything played so far at once. Worked out once per play, and again as samples arrive.
 */
const makeStrainProfile = () => {
	let profile = new Float32Array(0);
	let source: StrainHud['source'] | undefined;
	let end = -1;
	let revision: number | undefined;
	return (strain: StrainHud, songEnd: number) => {
		const n = strain.gauges.length;
		if (strain.source === source && songEnd === end && revision === strain.source.revision
			&& profile.length === n * POINTS) return profile;
		source = strain.source;
		end = songEnd;
		revision = strain.source.revision;
		if (profile.length === n * POINTS) profile.fill(0);
		else profile = new Float32Array(n * POINTS);
		for (let k = 0; k < POINTS * PER_POINT; k++) {
			const at = strain.source.strainsAt(k / (POINTS * PER_POINT) * songEnd);
			const point = Math.floor(k / PER_POINT);
			for (let i = 0; i < n; i++) {
				const slot = i * POINTS + point;
				profile[slot] = Math.max(profile[slot], at[strain.gauges[i].skill] ?? 0);
			}
		}
		return profile;
	};
};

// load fills the area under the line, from calm at the base to hot at full height
let areaFill: CanvasGradient | undefined;
let areaFillH = 0;
const sparkFill = (ctx: CanvasRenderingContext2D, h: number) => {
	if (areaFill && areaFillH === h) return areaFill;
	areaFillH = h;
	areaFill = ctx.createLinearGradient(0, -h, 0, 0);
	areaFill.addColorStop(0, 'rgba(255,64,64,0.7)');
	areaFill.addColorStop(0.5, 'rgba(255,110,170,0.45)');
	areaFill.addColorStop(1, 'rgba(150,160,255,0.1)');
	return areaFill;
};

// one sparkline, with its base at the origin: the song so far, from its start to `progress`
// of the way along, ending on the live value
const drawSparkline = (
	ctx: CanvasRenderingContext2D,
	profile: Float32Array,
	gauge: number,
	progress: number,
	v: number,
	w: number,
	h: number,
) => {
	const step = w / (POINTS - 1);
	const head = progress * w;
	const played = Math.floor(progress * (POINTS - 1));
	ctx.fillStyle = TRACK;
	ctx.fillRect(0, 0, w, 1);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	for (let k = 0; k <= played; k++) ctx.lineTo(k * step, -profile[gauge * POINTS + k] * h);
	ctx.lineTo(head, -v * h);
	ctx.lineTo(head, 0);
	ctx.closePath();
	ctx.fillStyle = sparkFill(ctx, h);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(0, -profile[gauge * POINTS] * h);
	for (let k = 1; k <= played; k++) ctx.lineTo(k * step, -profile[gauge * POINTS + k] * h);
	ctx.lineTo(head, -v * h);
	ctx.strokeStyle = load(v);
	ctx.lineWidth = 1.2;
	ctx.stroke();
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	ctx.arc(head, -v * h, 2, 0, Math.PI * 2);
	ctx.fill();
};

// eases each gauge toward its live strain; the most loaded one past a quarter, or -1
const easeGauges = (
	strain: StrainHud,
	strains: Readonly<Record<string, number>>,
	display: Record<string, number>,
) => {
	let hot = -1;
	let hotV = 0.25;
	for (let i = 0; i < strain.gauges.length; i++) {
		const { skill } = strain.gauges[i];
		const was = display[skill] ?? 0;
		const v = display[skill] = was + ((strains[skill] ?? 0) - was) * 0.2;
		if (v > hotV) {
			hot = i;
			hotV = v;
		}
	}
	return hot;
};

// a skill's name, right-aligned: lit with its load, glowing when it's the most loaded
const drawSkillName = (
	ctx: CanvasRenderingContext2D, label: string, v: number, hot: boolean, x: number, y: number,
) => {
	ctx.font = hot ? '700 11px "Exo 2", sans-serif' : '600 11px "Exo 2", sans-serif';
	ctx.textAlign = 'right';
	ctx.shadowColor = hot ? load(v) : SHADOW;
	ctx.shadowBlur = hot ? 8 : 3;
	ctx.fillStyle = hot ? '#fff' : NAME[Math.round(Math.min(1, v) * 16)];
	ctx.fillText(label, x, y);
	ctx.shadowBlur = 0;
};

// the strain panel: per skill its load over the song so far as a sparkline, the name lit
// with its load and the most loaded one glowing. `display` carries the eased live value
// between frames so per-note jumps read as motion.
const drawStrainPanel = (
	f: Frame,
	strain: StrainHud,
	display: Record<string, number>,
	profile: Float32Array,
) => {
	const { ctx, game, now, vp, g } = f;
	const l = strainLayout(vp, g.right, strain.gauges.length);
	const strains = strain.source.strainsAt(now);
	const progress = Math.max(0, Math.min(1, now / game.songEndMs));
	const hot = easeGauges(strain, strains, display);
	const right = l.x + l.width;
	for (let i = 0; i < strain.gauges.length; i++) {
		const { skill, label } = strain.gauges[i];
		const v = display[skill];
		const y = l.top + i * l.row;
		const base = l.stacked ? y + 6 + l.height : y + l.height;
		ctx.save();
		ctx.translate(l.x, base);
		drawSparkline(ctx, profile, i, progress, v, l.spark, l.height);
		ctx.restore();
		drawSkillName(ctx, label, v, i === hot, right, l.stacked ? y : base - 2);
	}
	g.warmup.width = 0;
	if (strain.warmupBar === undefined) return;
	g.warmup.left = l.x;
	g.warmup.top = l.warmup - 12;
	g.warmup.width = l.width;
	ctx.font = '600 11px "Exo 2", sans-serif';
	drawWarmupGauge(
		f,
		strain.warmupLabel ?? '',
		strain.warmupState ?? '',
		strain.warmupBar,
		l.x,
		l.warmup,
		strain.warmupTrend,
		l.width,
	);
};

// debug-only telemetry over the playfield (nps, visible notes, transitions, ...)
const drawDebugStats = (f: Frame, cxField: number) => {
	const { ctx, game, now, vp } = f;
	ctx.fillStyle = '#fff';
	ctx.font = '800 23px "Exo 2", sans-serif';
	ctx.textAlign = 'center';
	ctx.fillText(`${game.npsAt(now)}nps`, cxField, vp.h * 0.32);
	ctx.fillText(`${game.visibleNotesAt(now).length}v`, cxField, vp.h * 0.28);
	ctx.textAlign = 'left';
	ctx.fillText(
		`x${Math.round(game.scroll.getSpeedAt(now) * 100) / 100}`,
		15,
		vp.h * 0.1,
	);
};

/**
 * The HUD layer: the skin's hit burst, combo, score, accuracy and HP bar (render/stageHud),
 * then ours - strain panel, progress bar, hit-error bar. A factory because the HP and
 * strain gauges carry eased state between frames; the grade badge is a DOM element in the
 * caller, fed via `opts.onGrade` only when the grade changes.
 */
export const makeHud = () => {
	const strainDisplay: Record<string, number> = {};
	const strainProfile = makeStrainProfile();
	const stageHud = makeStageHud();
	// filled in every frame rather than made anew
	let errorBar: Parameters<typeof drawHitErrorBar>[2] | undefined;
	let hpEased = 1;
	let hpLast = performance.now();
	let lastGrade: Grade | undefined;

	return (f: Frame, stage?: StageFrame) => {
		const { ctx, game, now, vp, g, opts } = f;
		const cxField = g.x0 + g.fieldWidth / 2;

		// eased toward the live value, like stable's bar
		const tNow = performance.now();
		hpEased += (game.score.hp / MAX_HP - hpEased) * (1 - Math.exp(-(tNow - hpLast) / HP_EASE_MS));
		hpLast = tNow;
		// under the title where it is centred at the top; narrower, the title sits under the play
		// actions (Gameplay.css, 600px) and the score keeps the top
		if (stage) stageHud(stage, hpEased, opts.mobile && vp.w > 600 ? 60 : 0);

		if (opts.debug) drawDebugStats(f, cxField);
		if (opts.strain) {
			drawStrainPanel(f, opts.strain, strainDisplay, strainProfile(opts.strain, game.songEndMs));
		}

		// current grade badge (a DOM <img> in the caller, fed on change only)
		if (game.score.grade !== lastGrade) {
			lastGrade = game.score.grade;
			opts.onGrade?.(game.score.grade);
		}

		// progress bar
		const prog = Math.max(0, Math.min(1, now / game.songEndMs));
		ctx.fillStyle = 'rgba(255,255,255,0.12)';
		ctx.fillRect(0, 0, vp.w, 4);
		ctx.fillStyle = '#ff66ab';
		ctx.fillRect(0, 0, vp.w * prog, 4);

		// hit-error bar: bottom centre of the screen, whatever the stage
		errorBar ??= {
			windows: game.windows, hits: game.hits, now, cx: 0, y: 0, halfWidth: 170,
		};
		errorBar.windows = game.windows;
		errorBar.hits = game.hits;
		errorBar.now = now;
		errorBar.cx = vp.w / 2;
		errorBar.y = vp.h - 14 - (opts.safeBottom ?? 0);
		drawHitErrorBar(f.skin, ctx, errorBar);
	};
};
