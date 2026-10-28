import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { useState } from 'react';

import { LEVEL_COLOUR_MIN } from '@oss-idle/shared/display/levelDisplay';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { playLabel } from '@oss-idle/shared/mods';
import type { SkillGain } from '@oss-idle/shared/play';
import { versionLabel } from '@oss-idle/shared/rate';
import type { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import type SkillState from '@oss-idle/shared/rulesets/skillState';
import type { ScoreDTO } from '@oss-idle/shared/score';
import { playLevelOf } from '@oss-idle/shared/xp';

import { music } from '../../audio/MusicPlayer';
import { playShutter } from '../../audio/shutter';
import type { Score } from '../../db/schema/score';
import Entities from '../../entity/entities';
import { message } from '../../globals';
import type LightBeatmap from '../../osu/beatmap/LightBeatmap';
import { currentSkin } from '../../osu/skin/Skin';
import { selectedDef } from '../../rulesets/registry';
import type { Ranking } from '../multiplayer/useMatchRanking';
import usePlayers from '../multiplayer/usePlayers';
import {
	drawScoreCard,
	toPng,
} from './scoreCard';
import SharePreview from './SharePreview';

type Props = {
	score: Score | ScoreDTO,
	beatmap?: LightBeatmap,
	game?: ManiaGame,
	gradeImage: string,
	playerName: string,
	playedAt: string,
	judges: { label: string, count: number, color: string }[],
	gains: SkillGain[],
	failed?: boolean,
	ranking?: Ranking,
	/** a loved map: no pp to show */
	loved?: boolean,
};

/** The level a gain's skill is shown at after the play. */
const levelLabel = (p: SkillGain, skill?: SkillState): string => {
	const shown = playLevelOf(p.toLevel, p.toXp, skill?.lifetimeXp.get() ?? 0, skill?.prestige.get());
	const whole = Math.floor(shown);
	const part = Math.floor((shown - whole) * 100);
	if (whole < LEVEL_COLOUR_MIN || part === 0) return `${whole}`;
	return `${whole}.${String(part).padStart(2, '0')}`;
};

const download = (blob: Blob) => {
	const link = document.createElement('a');
	link.href = URL.createObjectURL(blob);
	link.download = 'oss-idle-score.png';
	link.click();
	URL.revokeObjectURL(link.href);
};

/** The notice ignores a repeat of the same text: clear it first. */
const notice = async (text: string) => {
	await message.set('');
	await message.set(text);
};

let shots = 0;

/** Captures the result screen as an image to share, onto the clipboard. */
export default function ShareScoreButton({
	score, beatmap, game, ranking, gains, loved, ...card
}: Props) {
	const { t } = useLingui();
	const live = music.beatmap.use((b) => b);
	const map = beatmap ?? live;
	const players = usePlayers();
	const [character] = useSynced(Entities.character);
	const [shot, setShot] = useState<{ id: number, canvas?: HTMLCanvasElement }>();

	const share = async () => {
		const id = ++shots;
		playShutter();
		setShot({ id });
		const meta = map?.set.metadata;
		const drawn = drawScoreCard({
			...card,
			title: meta && `${meta.artist} - ${meta.title}`,
			version: map && versionLabel(map.metadata.version, score.rate),
			creator: meta?.creator,
			background: map?.getBackgroundUri(),
			score: score.score,
			accuracy: score.accuracy,
			maxCombo: score.maxCombo,
			pfc: score.pfc,
			pp: loved ? undefined : score.pp,
			ur: score.ur,
			rate: score.rate,
			mods: score.mods,
			graphs: game && {
				game, skin: currentSkin.get(),
			},
			gains: gains.map(g => ({
				name: selectedDef().skillName(g.skill),
				level: levelLabel(g, character.skills.find(s => s.name === g.skill)),
				levels: g.toLevel - g.fromLevel,
				gained: g.gained,
			})),
			standings: ranking?.results.map(r => ({
				name: r.characterId === ranking.viewed
					? card.playerName
					: players.get(r.characterId)?.name ?? '...',
				score: r.score,
				combo: r.combo,
				accuracy: r.result?.accuracy ?? r.accuracy,
				mods: r.result ? playLabel(r.result.mods, r.result.rate) : '',
				failed: r.failed,
				self: r.characterId === ranking.viewed,
			})),
		});
		const image = drawn.then(toPng);
		// the clipboard needs a secure context: the LAN staging origin saves the file instead
		const canCopy = !!navigator.clipboard && typeof ClipboardItem !== 'undefined';
		const copied = canCopy
			? navigator.clipboard.write([new ClipboardItem({ 'image/png': image })])
				.then(() => true, () => false)
			: Promise.resolve(false);
		const canvas = await drawn;
		setShot(current => current?.id === id ? {
			id, canvas, 
		} : current);
		if (await copied) {
			void notice(t`Copied to clipboard`);
			return;
		}
		download(await image);
		void notice(t`Saved as an image`);
	};

	const done = () => setShot(undefined);

	return <>
		<button className="result__exit" onClick={() => void share()}>
			<Trans>SHARE</Trans>
		</button>
		{shot && <SharePreview key={shot.id} canvas={shot.canvas} onDone={done} />}
	</>;
}
