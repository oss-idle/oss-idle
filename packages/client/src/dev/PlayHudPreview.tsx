import '../scenes/Gameplay.css';

import {
	useEffect,
	useRef,
	useState,
} from 'react';

import type { Grade } from '@oss-idle/shared/grade';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import CharacterBot from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { scrollSpeedToMs } from '@oss-idle/shared/rulesets/mania/scroll_speed';
import type { ScoreDTO } from '@oss-idle/shared/score';

import DockPill from '../components/dock/DockPill';
import PlayLeaderboard, { type LivePlay } from '../components/gameplay/PlayLeaderboard';
import WarmupHint from '../components/gameplay/WarmupHint';
import RatedVersion from '../components/RatedVersion';
import { SETTINGS } from '../db/settings';
import GameplayRenderer from '../gameplay/gameplayRenderer';
import {
	makeGradePlacer,
	makeWarmupPlacer,
} from '../gameplay/gradeBadge';
import { publishPlayfieldEdge } from '../gameplay/playfieldEdge';
import type { BoardPlayer } from '../online/services/scores';
import { currentSkin } from '../osu/skin/Skin';
import { player4k } from '../rulesets/mania/4k/player';
import { sizeCanvas } from '../sizeCanvas';
import { strainChart } from './strainChart';

// strong enough that the sparklines sit between empty and full
const LEVEL = 60;
const WARMUP = 0.42;

const NAMES = ['Kurumi', 'shiroha', 'Taikonaut', 'lemon_tea', 'Vortex', 'mochi', 'Nyanpasu'];
const BOARD = NAMES.map((name, i) => ({
	score: {
		id: 900 + i, characterId: 900 + i, score: 960_000 - i * 92_000, maxCombo: 1100 - i * 120,
	} as ScoreDTO,
	player: { name } as BoardPlayer,
}));

/** The gameplay HUD over a looping play: the strain panel and warm-up bar on the right, the
 *  solo leaderboard on the left, the play's chrome and dock as gameplay lays them out. `?at=<ms>` starts the song there, the way arriving mid-play
 *  does. */
export default function PlayHudPreview() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gradeRef = useRef<HTMLDivElement>(null);
	const warmupRef = useRef<HTMLDivElement>(null);
	const [grade, setGrade] = useState<Grade>('X');
	const [skin] = useSynced(currentSkin);
	const gameRef = useRef<ManiaGame>(undefined);
	const [live] = useState(() => (): LivePlay => ({
		score: gameRef.current?.score.score ?? 0,
		combo: gameRef.current?.score.combo ?? 0,
		failed: false,
	}));

	useEffect(() => {
		const canvas = canvasRef.current!;
		const ctx = canvas.getContext('2d')!;
		const chart = strainChart();
		const gauges = player4k.strainGauges();
		const make = () => {
			const bot = new CharacterBot(makeOrderedSkills(LEVEL));
			return {
				bot, game: new ManiaGame(chart, bot, { noFail: true }),
			};
		};
		let { bot, game } = make();
		gameRef.current = game;
		let renderer = new GameplayRenderer(ctx, game, currentSkin.get());
		const seek = Number(new URLSearchParams(location.search).get('at') ?? 0);
		let start = performance.now() - seek;
		let raf = 0;
		const placeGrade = makeGradePlacer();
		const placeWarmup = makeWarmupPlacer();
		const draw = () => {
			let now = performance.now() - start - 1500;
			if (now > game.songEndMs + 1000) {
				({ bot, game } = make());
				gameRef.current = game;
				start = performance.now();
				now = -1500;
				renderer = new GameplayRenderer(ctx, game, currentSkin.get());
			}
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			const dpr = Math.min(devicePixelRatio, 2);
			if (canvas.width !== Math.round(w * dpr)) sizeCanvas(canvas, ctx, w, h, false);
			game.update(Math.max(0, now));
			renderer.setSkin(currentSkin.get());
			const vp = {
				w, h, scrollMs: scrollSpeedToMs(SETTINGS.scrollspeed.get()),
			};
			renderer.clear(vp);
			const g = renderer.draw(now, vp, {
				onGrade: setGrade,
				mobile: w < 850,
				safeBottom: parseFloat(getComputedStyle(canvas.parentElement!).paddingBottom) || 0,
				strain: {
					source: bot,
					gauges,
					warmupBar: WARMUP,
					warmupLabel: 'Warm-up',
					warmupState: 'Warming up',
					warmupTrend: 2,
				},
			});
			placeGrade(gradeRef.current, g);
			placeWarmup(warmupRef.current, g);
			publishPlayfieldEdge(g);
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, []);

	return (
		<div className='play' style={{
			position: 'fixed', background: '#1c1c2a', 
		}}>
			<canvas ref={canvasRef} style={{
				position: 'absolute', inset: 0, width: '100%', height: '100%',
			}} />
			<div ref={gradeRef} className='play__grade'>{skin.grade(grade)}</div>
			<WarmupHint bar={WARMUP} boxRef={warmupRef} />
			<div className='play__actions'>
				<button className='play__abort'>abort</button>
				<button className='play__quit'>quit</button>
			</div>
			<div className='play__title'>
				Kobaryo - Yura-Yura Sweet Genocide [feat. t+pazolite]
				<RatedVersion version='YuRa-yUrA!!!' rate={0.7} />
			</div>
			<PlayLeaderboard rows={BOARD} live={live} />
			<DockPill />
		</div>
	);
}
