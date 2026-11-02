import type { ManiaSim } from '../sim.js';
import Bot7k, { type ScoreLike7k } from './bots/character.js';
import type { SkillName7k } from './skills.js';

/** 7K's public sim. */
export const sim7k: ManiaSim<SkillName7k, ScoreLike7k> = { bot: play => new Bot7k(play) };
