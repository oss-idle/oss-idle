import { SKILL_GLYPHS } from '@oss-idle/shared/rulesets/mania/4k/medals';

import type { ClientGenetics } from '../../ruleset';
import { GENE_TEXT } from './geneText';
import {
	QUIZ,
	SKILL_PITCH,
} from './quiz';

/** 4K's genetics as the player reads them. */
export const genetics4k: ClientGenetics = {
	genes: GENE_TEXT, quiz: QUIZ, pitch: SKILL_PITCH, glyph: SKILL_GLYPHS,
};
