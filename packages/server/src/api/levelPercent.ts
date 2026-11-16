import type { BigLike } from '@oss-idle/shared/big';
import { levelProgress } from '@oss-idle/shared/xp';

/** Progress into the next level as a whole percent, 0 to 99: osu!'s `level.progress`. */
export const levelPercent = (level: number, xp: BigLike): number =>
	Math.min(99, Math.floor(levelProgress(level, xp) * 100));
