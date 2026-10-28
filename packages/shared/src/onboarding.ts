import { z } from 'zod';

// whitespace, zero-width and Hangul fillers, braille blank
const INVISIBLE = String.raw`[\p{White_Space}\p{Default_Ignorable_Code_Point}\u2800]+`;
const EDGE_INVISIBLE = new RegExp(`^${INVISIBLE}|${INVISIBLE}$`, 'gu');

const NAME_WIDTH = 32;
const WIDE = new RegExp(String.raw`[\p{scx=Han}\p{scx=Hangul}\p{scx=Hiragana}\p{scx=Katakana}`
	+ String.raw`\p{Emoji_Presentation}\uFE0F\uFF01-\uFF60\uFFE0-\uFFE6]`, 'u');
// one character drawn several letters wide: Arabic honorific ligatures, two/three-em dashes,
// cuneiform, hieroglyphs
const OVERWIDE = /[\uFDFA-\uFDFD\u2E3A\u2E3B\u{12000}-\u{1254F}\u{13000}-\u{1345F}]/u;
const MARKS = /\p{M}/gu;
const graphemes = new Intl.Segmenter();

/** Width of one grapheme in Latin letters; one that stacks marks (zalgo) or is
 *  overwide never fits. */
const graphemeWidth = (g: string) =>
	OVERWIDE.test(g) || (g.match(MARKS)?.length ?? 0) > 3 ? Infinity
		: WIDE.test(g) ? 2 : 1;

/** Rough rendered width of a name in Latin letters: players' fallback fonts
 *  decide the real one. */
export const nameWidth = (name: string) =>
	[...graphemes.segment(name)].reduce((w, { segment }) => w + graphemeWidth(segment), 0);

// controls, bidi overrides, zero-width and filler characters, spaces other than ASCII's
const HIDDEN = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]|(?! )\p{White_Space}/u;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;
// ZWJ, emoji presentation and tags, which build emoji
const EMOJI_JOINERS = /[\u200D\uFE0F\u{E0020}-\u{E007F}]/gu;

/** A grapheme that draws nothing or reorders the text around it. */
const hides = (g: string) => HIDDEN.test(EMOJI.test(g) ? g.replace(EMOJI_JOINERS, '') : g);

/** Character name payload, shared by onboarding and username changes. Invisible
 *  edges are stripped, so a blank name is empty and a padded one is the name
 *  it pads; invisible characters inside it are refused. */
const characterName = z.string()
	.transform(s => s.normalize('NFC').replace(EDGE_INVISIBLE, ''))
	.pipe(z.string().min(1).max(32)
		.refine(s => nameWidth(s) <= NAME_WIDTH, 'Name is too wide')
		.refine(s => ![...graphemes.segment(s)].some(({ segment }) => hides(segment)),
			'Name has invisible characters'));
export const characterNameBody = z.object({ name: characterName });
export type CharacterNameBody = z.infer<typeof characterNameBody>;

/**
 * First-login onboarding payload: name the new character. The account always
 * starts fresh - local Guest progress is no longer migrated online.
 */
export const onboardingBody = characterNameBody;
export type OnboardingBody = CharacterNameBody;
