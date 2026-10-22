import Synced from '@oss-idle/shared/helpers/synced';
import './Skin.css';
import {
	GRADE,
	Grade,
	Grades,
	JUDGEMENT,
	Judgements,
} from '@oss-idle/shared/judgement';
import {
	Color,
	ColorSchema,
} from '@oss-idle/shared/types/color';
import { merge } from 'ts-deepmerge';
import { SkinDAO } from '../../db/schema/skin';
import { z } from 'zod';
import Log from '@oss-idle/shared/helpers/log';
import {
	ph,
	t,
} from '@lingui/core/macro';
import {
	deepPartial,
	DeepPartial,
} from '@oss-idle/shared/types/deep_partial';
import { ValueIn } from '@oss-idle/shared/helpers/mapped';

const COLUMN_RECORD_EXAMPLE = '{ 0: ..., 1: ..., 2: ..., 3: ... }';

export const HITSOUND = { NORMAL: 'default/normal-hitnormal' } as const;
export const Hitsounds = Object.values(HITSOUND);
export type Hitsound = ValueIn<typeof HITSOUND>;

const JudgeConfigSchema = z.object({
	text: z.string(),
	judge: ColorSchema,
	hitErrorBg: ColorSchema,
	hitErrorTick: ColorSchema,
	devianceGraphBg: ColorSchema,
	devianceGraphTick: ColorSchema,
});
type JudgeConfig = z.infer<typeof JudgeConfigSchema>;

const getUniformJudgeConfig = (color: Color, text: string): JudgeConfig => ({
	text,
	judge: color,
	hitErrorBg: color,
	hitErrorTick: color,
	devianceGraphBg: color,
	devianceGraphTick: color,
});

const HpBarSchema = z.object({
	width: z.number(),
	height: z.number(),
	gap: z.number(),
	fromBottom: z.number(),
	radius: z.number(),
	background: ColorSchema,
	fill: ColorSchema,
	fillLow: ColorSchema,
	lowThreshold: z.number(),
	transitionMs: z.number(),
});

// The default skin defines everything; it's the source every loaded skin merges onto.
const SkinDefinitionSchema = z.object({
	judgements: z.record(z.enum(Judgements), JudgeConfigSchema),
	playfield: z.object({ 
		columnWidth: z.number(),
		noteHeight: z.number(),
		receptorHeight: z.number(),
		hitPosition: z.number(),
		upscroll: z.boolean(),
	}),
	hitObjects: z.record(
		z.number(),
		z.object({ color: ColorSchema }),
		{ error: () => t`Expected a column record like ${ph({ example: COLUMN_RECORD_EXAMPLE })}` },
	),
	hpBar: HpBarSchema,
	grade: z.record(z.enum(Grades), z.string()),
	hitSounds: z.record(z.enum(Hitsounds), z.string()),
	menu: z.object({
		// supporters only: an image url shown behind the main menu instead of the map's
		background: z.url({ protocol: /^https?$/ }).optional(),
		// a sound played when the game exits (osu!'s seeya); none by default, so exiting stays silent
		seeya: z.string().optional(),
	}),
});

export type SkinDefinition = z.infer<typeof SkinDefinitionSchema>;

// A loaded skin only overrides what it wants, so every field is optional down to the leaves.
const PartialSkinDefinitionSchema = deepPartial(SkinDefinitionSchema) as
	z.ZodType<DeepPartial<SkinDefinition>>;
export type PartialSkinDefinition = DeepPartial<SkinDefinition>;

/** Validate raw skin JSON source. Returns a readable error, or undefined when valid. */
export const validateSkinSource = (source: string): string | undefined => {
	let data: unknown;
	try {
		data = JSON.parse(source);
	} catch (e) {
		return (e as Error).message;
	}
	const parse = PartialSkinDefinitionSchema.safeParse(data);
	if (!parse.success) return z.prettifyError(parse.error);
};

export const defaultSkin: () => SkinDefinition = () => ({
	hitObjects: {
		0: { color: ColorSchema.parse('#e8e8f0') },
		1: { color: ColorSchema.parse('#63b3ff') },
		2: { color: ColorSchema.parse('#63b3ff') },
		3: { color: ColorSchema.parse('#e8e8f0') },
	},
	playfield: { 
		columnWidth: 74,
		noteHeight: 24,
		receptorHeight: 30,
		hitPosition: 100,
		upscroll: false,
	},
	judgements: {
		[JUDGEMENT.DIVINE]: getUniformJudgeConfig(ColorSchema.parse('#a8f0ff'), 'DIVINE'),
		[JUDGEMENT.MARVELOUS]: getUniformJudgeConfig(ColorSchema.parse('#ffe88a'), 'MARVELOUS'),
		[JUDGEMENT.PERFECT]: getUniformJudgeConfig(ColorSchema.parse('#ffd24a'), 'PERFECT'),
		[JUDGEMENT.GREAT]: getUniformJudgeConfig(ColorSchema.parse('#6fe07a'), 'GREAT'),
		[JUDGEMENT.GOOD]: getUniformJudgeConfig(ColorSchema.parse('#4aa6ff'), 'GOOD'),
		[JUDGEMENT.BAD]: getUniformJudgeConfig(ColorSchema.parse('#b06bd6'), 'BAD'),
		[JUDGEMENT.MISS]: getUniformJudgeConfig(ColorSchema.parse('#ff5a72'), 'MISS'),
	},
	hpBar: {
		width: 16,
		height: 340,
		gap: 5,
		fromBottom: 0,
		radius: 4,
		background: ColorSchema.parse('rgba(0, 0, 0, 0.45)'),
		fill: ColorSchema.parse('#ffffff'),
		fillLow: ColorSchema.parse('#ff5a72'),
		lowThreshold: 0.3,
		transitionMs: 200,
	},
	grade: {
		[GRADE.XX]: '/skins/default/grade-XX.png',
		[GRADE.X]: '/skins/default/grade-X.png',
		[GRADE.SS]: '/skins/default/grade-SS.png',
		[GRADE.S]: '/skins/default/grade-S.png',
		[GRADE.A]: '/skins/default/grade-A.png',
		[GRADE.B]: '/skins/default/grade-B.png',
		[GRADE.C]: '/skins/default/grade-C.png',
		[GRADE.D]: '/skins/default/grade-D.png',
		[GRADE.F]: '/skins/default/grade-F.png',
	},
	hitSounds: { [HITSOUND.NORMAL]: '/skins/default/hitsounds/normal-hitnormal.wav' },
	menu: {},
});

export default class Skin {

	public readonly data: SkinDefinition;

	constructor(protected definition?: PartialSkinDefinition) {
		const def = defaultSkin();

		if (definition) {
			const parse = PartialSkinDefinitionSchema.safeParse(definition);
			const parsed = parse.success ? definition : def;

			if (!parse.success) {
				Log.errorPopup(`Failed to load skin: ${z.prettifyError(parse.error)}`);
			}

			definition = parsed;
		}

		this.data = merge(def, definition ?? {}) as SkinDefinition;

		// deep merge concats the hitobject array so we overwrite the specified cols
		this.data.hitObjects = { ...def.hitObjects };
		for (const [col, ho] of Object.entries(definition?.hitObjects ?? {})) {
			const n = Number(col);
			this.data.hitObjects[n] = merge(def.hitObjects[n] ?? {}, ho ?? {}) as { color: Color };
		}
	}

	public grade(grade: Grade, className: string = ''): JSX.Element {
		return <img
			className={`${className} skin__grade`}
			src={this.data.grade[grade]}
			alt={`Grade ${grade}`}
			draggable={false}
		/>;
	}

}

export const currentSkinDAO = new Synced<SkinDAO | undefined>(undefined);
export const currentSkin = new Synced(new Skin());

currentSkinDAO.sync(current => 
	currentSkin.set(current ? new Skin(JSON.parse(current.definition)) : new Skin()),
);
currentSkin.sync(current => console.log(current));

SkinDAO.getEnabled().then(current => {
	if (current) currentSkinDAO.set(current);
});