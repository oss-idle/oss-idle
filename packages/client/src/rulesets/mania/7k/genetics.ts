import { SKILL_GLYPHS_7K } from '@oss-idle/shared/rulesets/mania/7k/medals';

import type { ClientGenetics } from '../../ruleset';
import { GENE_TEXT_7K } from './geneText';
import {
	QUIZ_7K,
	SKILL_PITCH_7K,
} from './quiz';

/** 7K's genetics as the player reads them. */
export const genetics7k: ClientGenetics = {
	genes: GENE_TEXT_7K, quiz: QUIZ_7K, pitch: SKILL_PITCH_7K, glyph: SKILL_GLYPHS_7K,
};
