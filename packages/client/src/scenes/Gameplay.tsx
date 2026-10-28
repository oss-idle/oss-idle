import './Gameplay.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import { Beatmap } from 'osu-classes';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { type Grade } from '@oss-idle/shared/grade';
import sleep from '@oss-idle/shared/helpers/sleep';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import { retriesOnFail } from '@oss-idle/shared/mods';
import type {
	MedalBatch,
	SkillGain,
} from '@oss-idle/shared/play';
import { LEAD_IN_MS } from '@oss-idle/shared/play';
import { hasUnlock } from '@oss-idle/shared/rebirth';
import type { Bot } from '@oss-idle/shared/rulesets/mania/bot';
import ReplayBot from '@oss-idle/shared/rulesets/mania/bots/replay';
import { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { scrollSpeedToMs } from '@oss-idle/shared/rulesets/mania/scroll_speed';
import {
	type PlayEffect,
	type PlayEvent,
	playReducer,
	type PlayScoring,
	type PlayState,
	startPlay,
} from '@oss-idle/shared/sim/playLifecycle';

import { effects } from '../audio/EffectPlayer';
import {
	makeComboBreakSound,
	preloadSamples,
	prepareNoteSounds,
	scheduleHitsound,
	type SoundResolver,
	stopScheduledHitsounds,
} from '../audio/hitsounds';
import {
	music,
	PLAYER_MODE,
} from '../audio/MusicPlayer';
import { SampleSchedule } from '../audio/SampleSchedule';
import ContextMenu from '../components/ContextMenu';
import PlayLeaderboard, { type LivePlay } from '../components/gameplay/PlayLeaderboard';
import SkipToEndButton from '../components/gameplay/SkipToEndButton';
import useBoardRows from '../components/gameplay/useBoardRows';
import WarmupHint from '../components/gameplay/WarmupHint';
import MatchScoreboard from '../components/multiplayer/MatchScoreboard';
import RoundWaiting from '../components/multiplayer/RoundWaiting';
import RatedVersion from '../components/RatedVersion';
import ResultMods from '../components/result/ResultMods';
import { Score } from '../db/schema/score';
import { ScoreXP } from '../db/schema/score_xp';
import { SETTINGS } from '../db/settings';
import Entities from '../entity/entities';
import GameplayRenderer, {
	type PlayfieldGeometry,
	type StrainHud,
} from '../gameplay/gameplayRenderer';
import {
	makeGradePlacer,
	makeModsPlacer,
	makeWarmupPlacer,
} from '../gameplay/gradeBadge';
import { publishPlayfieldEdge } from '../gameplay/playfieldEdge';
import { modsOfPlay } from '../gameplay/playMods';
import { rateOfPlay } from '../gameplay/playRate';
import ServerStrains from '../gameplay/ServerStrains';
import {
	type WarmupStage,
	warmupStage,
} from '../gameplay/warmupStage';
import { debugMode } from '../globals';
import Controls from '../input/Controls';
import { logPlayFinished } from '../logs';
import {
	abortLocalPlay,
	currentLocalPlay,
	finishLocalPlay,
	localPlayResult,
} from '../online/localPlay';
import Multiplayer from '../online/multiplayer';
import {
	abortPlaySession,
	fetchPlayResult,
	finishPlaySession,
	type PlayContext,
	PlayResultError,
	skipPlaySession,
} from '../online/play';
import PlayManager from '../online/playManager';
import Socket from '../online/socket';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import { loadStoryboardAssets } from '../osu/beatmap/storyboard';
import calculatePP from '../osu/pp';
import { currentSkin } from '../osu/skin/Skin';
import { maniaOffsets } from '../rulesets/mania/wire';
import { chartDef } from '../rulesets/registry';
import type {
	ManiaPlayer,
	PlayBot,
} from '../rulesets/ruleset';
import { sizeCanvas } from '../sizeCanvas';
import SceneManager, { SCENE } from './SceneManager';
import { Transition } from './Transition';

/** A play of a chart open in the editor: the character plays it from `start`,
 *  like a debug play (no-fail, never saved), then the editor takes over again. */
export type TestPlay = {
	/** the .osu text as it stands in the editor, saved or not */
	chart: string,
	start: number,
	back: () => void,
};

/** Where a play goes when it ends early: song select, or back to the editor it tests. */
const leavePlay = (test?: TestPlay) =>
	(test ? test.back() : SceneManager.set(Multiplayer.afterPlay()));

type Props = {
	beatmapInfo: LightBeatmap,
	beatmap: Beatmap,
	play: PlayContext,
	/** prior plays of this map by the live character - seeds the memory skill */
	timesPlayed: number,
	/** how the map's ruleset plays here */
	player: ManiaPlayer,
	transition: Transition,
	test?: TestPlay,
};

/** approach time at base speed (ms a note is visible) lower = faster scroll */
/** how far ahead hitsounds are queued onto the audio clock. Must exceed the
 *  background timer-throttle floor (~1s) so a blurred tab still queues the next
 *  chunk before the previous one runs out - that's what keeps sound going. */
/** How tired the play has the character, when it does. */
const tirednessOf = (play: PlayContext) =>
	play.mode !== 'debug' && play.fatigue !== undefined
		? {
			fatigue: play.fatigue, warmup: play.warmup ?? 1,
		}
		: undefined;

const HITSOUND_LOOKAHEAD_MS = 1500;
/** keep the scheduler ticking off the rAF loop so it runs while the tab is
 *  hidden (rAF is paused then; timers are merely throttled). */
const HITSOUND_TICK_MS = 250;

/** How long a ranked skip waits for the server to release the rest of the replay
 *  before finishing with whatever arrived. */
const SKIP_WAIT_MS = 5000;

/** How long to wait between asking the server for a result it is still storing.
 *  How many times is the machine's business (RESULT_ATTEMPTS). */
const RESULT_POLL_MS = 200;

export default function Gameplay({
	beatmapInfo, 
	beatmap, 
	play,
	timesPlayed, 
	player,
	transition, 
	test,
}: Props) {
	music.mode.set(PLAYER_MODE.SINGLE);

	const [skin] = useSynced(currentSkin);
	const [scrollSpeed] = useSynced(SETTINGS.scrollspeed);
	const SCROLL_MS = scrollSpeedToMs(scrollSpeed);
	const [debug] = useSynced(debugMode);
	const { i18n, t } = useLingui();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gradeRef = useRef<HTMLDivElement>(null);
	const modsRef = useRef<HTMLDivElement>(null);
	const warmupRef = useRef<HTMLDivElement>(null);
	// background, storyboard video and the dim overlay are stacked DOM layers
	// behind the (transparent) playfield canvas: bg → video → dim → canvas. This
	// lets a native <video> play between the background and the playfield without
	// drawing it frame-by-frame, and mirrors osu's layer model.
	const bgRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const dimRef = useRef<HTMLDivElement>(null);
	// keysound + storyboard-sample schedulers (effects channel), and the set of
	// note times that carry a keysound (so the default hitsound is suppressed for
	// them). Built once the map's assets are decoded and preloaded.
	const sampleSchedRef = useRef<SampleSchedule | null>(null);
	const videoInfoRef = useRef<{ time: number } | null>(null);
	const [done, setDone] = useState(false);
	const [waitingRound, setWaitingRound] = useState(false);
	// live grade for the HUD badge - a DOM <img> overlaid on the canvas, so it is
	// React state pushed from the renderer only when the grade actually changes
	const [grade, setGrade] = useState<Grade>('X');
	const gameRef = useRef<ManiaGame | null>(null);
	// the play is over; the render loop switches to its outro clock so the
	// playfield stops tracking a song that has ended
	const forceFinishRef = useRef(false);
	const offsetCursorRef = useRef(0);
	const botRef = useRef<Bot | null>(null);
	// source of the strain HUD's per-skill values - the playing bot when the play
	// is simulated locally, or a display-only side analysis for ranked replays
	const strainBotRef = useRef<StrainHud['source'] | null>(null);
	/** a server play's gauges, fed by its replay chunks */
	const serverStrainsRef = useRef<ServerStrains | null>(null);
	const gauges = useMemo(() => player.strainGauges(), [i18n, player]);
	// osu!'s in-game leaderboard, unless a match's live standings take its place
	const board = useBoardRows(
		beatmapInfo.metadata.id, !Multiplayer.playingRound(beatmapInfo.metadata.id),
	);
	const live = useCallback((): LivePlay => ({
		score: gameRef.current?.score.score ?? 0,
		combo: gameRef.current?.score.combo ?? 0,
		failed: gameRef.current?.score.failed ?? false,
	}), []);
	const warmupLabel = useMemo(() => t`Warm-up`, [t]);
	const warmupState = useMemo(() => {
		const labels: Record<WarmupStage, string> = {
			cold: t`Cold`,
			warming: t`Warming up`,
			peak: t`Peak`,
			pushing: t`Pushing`,
			fatigued: t`Fatigued`,
		};
		if (play.mode === 'debug' || play.warmupBar === undefined) return '';
		return labels[warmupStage(play.warmupBar)];
	}, [t, play]);
	// clock state lives in a ref so it survives HMR effect re-runs: the lead-in
	// isn't restarted and the audio isn't re-triggered, keeping the gameplay
	// clock continuous with the (single, still-playing) audio.
	// `paused` holds the clock at the very start of the lead-in until the transition
	// has revealed the playfield - so gameplay doesn't begin behind the cover.
	// `pauseAt` holds the song clock frozen at a song position while paused
	const clockRef = useRef<{
		leadStart: number; 
		audioStarted: boolean;
		noAudio?: boolean;
		paused: boolean; 
		pauseAt?: number
	} | null>(null);
	// index into game.headHits of the next hitsound still to be queued. Persisted
	// across HMR re-runs so the scheduler resumes instead of re-queueing.
	const hitsoundPtr = useRef(0);
	// latest rendered song position (ms), so the debug transport controls (which
	// live outside the rAF effect) can read the current clock.
	const nowRef = useRef(0);
	// current visual scroll window (ms), read by the render loop each frame so a
	// mid-play scroll-speed change refreshes the playfield without re-running the
	// render effect (which would reset the rAF loop and re-bind listeners).
	const scrollMsRef = useRef(SCROLL_MS);
	scrollMsRef.current = SCROLL_MS;
	const [character] = useSynced(Entities.character);

	// every play but the debug one is owned by someone (the server, or the local
	// session) and keeps running whether or not this scene is watching it
	const owned = play.mode !== 'debug';

	// the dock reads the running play from the manager, which would otherwise
	// have to find this map by id in the beatmap store - a lookup that can miss
	useEffect(() => {
		if (owned) PlayManager.attach(play, beatmapInfo);
	}, []);

	// stop the play and leave (reached through the confirm menu)
	const abortPlay = () => {
		if (play.mode === 'ranked') void abortPlaySession(play.token);
		else if (owned) abortLocalPlay(play.token);
		dispatch({ type: 'abort' });
	};

	// quit: leave while the character keeps playing. Nothing to tell anyone -
	// the manager never re-enters gameplay on its own, so leaving stays left.
	const onQuit = () => onExit();

	// abort (default, Esc) asks for confirmation first; Esc again cancels. A test
	// play has nothing to lose: it goes straight back to the editor.
	const [confirmAbort, setConfirmAbort] = useState(false);
	const onAbort = () => (test ? abortPlay() : setConfirmAbort(c => !c));

	Controls.back.usePress(onAbort);

	const rate = rateOfPlay(play);
	const mods = modsOfPlay(play);
	// a match round plays on past a fail, as the server ran it
	const playOn = Multiplayer.playingRound(beatmapInfo.metadata.id);

	// build the game once; a freshly-built game starts a fresh clock so the two
	// always stay in lock-step (HMR preserves both refs → seamless resume)
	const ensureGame = () => {
		if (gameRef.current !== null || botRef.current !== null || !character) return;
		// every play replays offsets resolved before it (the server's, or the local
		// session's), but an editor test play, which a local bot plays
		let testBot: PlayBot | undefined;
		if (play.offsets) {
			botRef.current = new ReplayBot(play.offsets);
		} else {
			testBot = player.bot(character.skills, timesPlayed);
			botRef.current = testBot;
		}
		// scroll speed is a purely visual preference (applied below via pxPerUnit);
		// the bot's reading window must stay scroll-speed-independent so the same map
		// scores identically regardless of the player's chosen speed (and matches the
		// server, which constructs ManiaGame with the default window).
		const divine = hasUnlock(character.generation, 'DIVINE');
		gameRef.current = new ManiaGame(beatmap, botRef.current, {
			noFail: play.mode === 'debug', divine, rate, mods, playOn,
		});
		// the strain gauges: the bot itself for a test or local play, the server's
		// samples for a play it ran
		const local = owned && play.mode !== 'ranked'
			? currentLocalPlay()
			: undefined;
		if (testBot) {
			strainBotRef.current = testBot;
		} else if (local?.token === (owned ? play.token : '')) {
			// the play being watched *is* this analysis - no approximation needed
			strainBotRef.current = local.bot;
		} else if (play.mode === 'ranked' || play.mode === 'debug') {
			// the server played it: its gauges come with the replay
			serverStrainsRef.current = new ServerStrains();
			serverStrainsRef.current.add(play.strains);
			strainBotRef.current = serverStrainsRef.current;
		} else {
			const bot = player.bot(character.skills, timesPlayed, tirednessOf(play));
			new ManiaGame(beatmap, bot, {
				divine, rate, mods, playOn,
			});
			strainBotRef.current = bot;
		}
		clockRef.current = null;
		hitsoundPtr.current = 0;
	};
	ensureGame();
	const game = gameRef.current;

	// Gameplay owns the decoded buffer; when the play ends (finish, fail, or quit)
	// let the track keep playing to its natural end instead of cutting it, so the
	// result/select screens continue the same audio seamlessly. It hands back to
	// the streaming player on its own end, or as soon as a different song plays.
	const releaseAudio = () => {
		music.endGameplay();
	};

	const onExit = () => {
		releaseAudio();
		leavePlay(test);
		// a test play can be left while its cover is still up
		if (test) void transition.reveal();
	};

	// --- play lifecycle -----------------------------------------------------
	// The machine in shared/sim/playLifecycle decides what happens; everything
	// below only carries its effects out. Nothing here may end a play on its own:
	// dispatch an event and let the machine say so, or the endings drift apart
	// again.
	const lifecycleRef = useRef<PlayState>(startPlay(play.mode as PlayScoring));
	/** this client's own score, shown when nobody else owns the result */
	const localScoreRef = useRef<Score | undefined>(undefined);
	/** the authoritative result, once the server has one */
	const serverScoreRef = useRef<{ score: Score, gains?: SkillGain[] } | undefined>(undefined);
	/** medals the server awarded with this play's result, for the result screen */
	const medalsRef = useRef<MedalBatch>();
	/** the play's token, which only a ranked play has */
	const rankedToken = play.mode === 'ranked' ? play.token : undefined;

	const dispatch = (event: PlayEvent) => {
		const from = lifecycleRef.current.phase;
		const stepped = playReducer(lifecycleRef.current, event);
		lifecycleRef.current = stepped.state;
		// one line per transition: what happened, where it moved, what it asked
		// for. If a play ever stalls again this says which phase it stalled in.
		console.log(`[play] ${event.type} | ${from} -> ${stepped.state.phase} | `
			+ (stepped.effects.map(e => e.type).join(' ') || 'no effects'), event);
		for (const effect of stepped.effects) {
			// an effect that throws must not vanish: without this the play stalls in
			// whatever phase it was in, with nothing on screen to say why
			void perform(effect).catch((e) => {
				console.error(`[play] effect ${effect.type} failed`, e);
				if (effect.type === 'build-local-score') {
					dispatch({
						type: 'local-ready', failed: gameRef.current?.score.failed ?? false,
					});
				}
			});
		}
	};

	/** Build this client's score for the play, and for a locally-scored one save
	 *  it and award its XP. pp must never gate it: a rejection here would leave
	 *  the play with nothing to show. */
	const buildLocalScore = async () => {
		const game = gameRef.current;
		if (!game) {
			// nothing to build from, but the machine still has to be told
			dispatch({
				type: 'local-ready', failed: false,
			});
			return;
		}
		const def = chartDef(beatmapInfo.metadata.mode, beatmapInfo.metadata.keys);
		const pp = await calculatePP(def, game.score, beatmap, rate, mods).catch((e) => {
			console.warn('[score] pp failed, finishing without it', e);
			return 0;
		});
		const c = game.score.counts;
		const failed = game.score.failed;
		const local = new Score({
			characterId: Number(character.id),
			beatmapId: beatmap.metadata.beatmapId,
			score: Math.round(game.score.score),
			accuracy: game.score.accuracy,
			maxCombo: game.score.maxCombo,
			...c,
			grade: game.score.grade,
			pp,
			ur: game.unstableRate(),
			pfc: c.MISS === 0 && c.BAD === 0 && c.GOOD === 0,
			playedAt: Date.now(),
			rate,
			mods,
		});
		localScoreRef.current = local;

		// The scene never saves: the play's owner does, once, whether or not
		// anyone watched. This score is only the fallback display for when the
		// owner cannot answer.
		dispatch({
			type: 'local-ready', failed,
		});
	};

	/** Read the local session's result, which exists the moment its clock runs
	 *  out. Polls the same way the ranked path does while it is still running. */
	const fetchLocalResult = async () => {
		if (play.mode === 'debug' || play.mode === 'ranked') return;
		const res = localPlayResult(play.token);
		if (!res) {
			await sleep(RESULT_POLL_MS);
			dispatch({
				type: 'owner-error', retryable: true,
			});
			return;
		}
		if (res.failed || !res.score) {
			dispatch({
				type: 'owner-result', hasScore: false,
			});
			return;
		}
		serverScoreRef.current = {
			score: res.score, gains: res.gains,
		};
		dispatch({
			type: 'owner-result', hasScore: true,
		});
	};

	/** Ask for the authoritative result. Polls rather than backing off - the wait
	 *  is the owner storing the play, which finishes when it finishes. */
	const fetchResult = async (attempt: number) => {
		if (!rankedToken) {
			await fetchLocalResult();
			return;
		}
		let result: Awaited<ReturnType<typeof fetchPlayResult>>;
		try {
			result = await fetchPlayResult(rankedToken, true, true);
		} catch (e) {
			// `unknown` means the result is gone for good (finalised then expired, or
			// a long AFK); anything else is worth asking again while it is stored
			const retryable = !(e instanceof PlayResultError && e.reason === 'unknown');
			console.warn(`[play] result attempt ${attempt} failed, retryable=${retryable}`, e);
			if (retryable) await sleep(RESULT_POLL_MS);
			else console.warn('[score] result gone, showing local replay', e);
			dispatch({
				type: 'owner-error', retryable,
			});
			return;
		}
		// From here the result is ours: a slip while mirroring it must not ask the
		// server again - it already handed this result (and its medals) over once.
		console.log('[play] server result', JSON.stringify(result).slice(0, 160));
		medalsRef.current = result.medals;
		if (result.failed || !('score' in result) || !result.score) {
			dispatch({
				type: 'owner-result', hasScore: false,
			});
			return;
		}
		// mirror the server's score locally so it shows in history/leaderboards
		const score = Score.fromDTO(result.score);
		try {
			logPlayFinished(score, beatmapInfo, result.gains);
		} catch (e) {
			console.warn('[play] play log failed', e);
		}
		const saved = await score.add().catch((e) => {
			console.warn('[score] local mirror failed', e);
			return score;
		});
		void ScoreXP.record(saved, result.gains);
		serverScoreRef.current = {
			score: saved, gains: result.gains,
		};
		dispatch({
			type: 'owner-result', hasScore: true,
		});
	};

	const showResult = (source: 'owner' | 'local', failed: boolean) => {
		if (test) {
			onExit();
			return;
		}
		if (failed && owned && !playOn && retriesOnFail(mods)) {
			PlayManager.playAgain(beatmapInfo);
			return;
		}
		const game = gameRef.current;
		const server = serverScoreRef.current;
		if (source === 'owner' && server) {
			SceneManager.set(
				SCENE.RESULT, server.score, game ?? undefined, server.gains, false, beatmapInfo, medalsRef.current,
			);
			return;
		}
		const local = localScoreRef.current;
		if (!local) {
			console.error('[score] no result to show, leaving gameplay');
			onExit();
			return;
		}
		// no progression to show: the owner computes it, and this is the path where
		// it could not be read
		SceneManager.set(
			SCENE.RESULT, local, game ?? undefined, undefined, failed, beatmapInfo, medalsRef.current,
		);
	};

	/** The play ends here: judge whatever is left, and pull the local session's
	 *  clock in with it - its result is the one that will be shown, and waiting
	 *  the real map out would leave the skip hanging. */
	const resolveNow = () => {
		gameRef.current?.update(gameRef.current.songEndMs + 1000);
		if (owned && play.mode !== 'ranked') finishLocalPlay(play.token);
	};

	const perform = async (effect: PlayEffect) => {
		switch (effect.type) {
			case 'resolve-map':
				resolveNow();
				return;
			case 'stop-hitsounds':
				stopScheduledHitsounds();
				return;
			case 'release-audio':
				releaseAudio();
				return;
			case 'freeze-playfield':
				// the render loop switches to its outro clock, and the chrome swaps to
				// the finished state
				forceFinishRef.current = true;
				setDone(true);
				return;
			case 'mark-complete':
				if (owned) PlayManager.complete(play.token);
				return;
			case 'request-server-finish':
				if (rankedToken) void finishPlaySession(rankedToken, effect.cursor);
				// never let a skip wait forever on a reply that may not come
				window.setTimeout(() => dispatch({ type: 'replay-timeout' }), SKIP_WAIT_MS);
				return;
			case 'build-local-score':
				await buildLocalScore();
				return;
			case 'fetch-result':
				await fetchResult(effect.attempt);
				return;
			case 'show-result':
				// a match round: stay here, watching the others' scores, until it's over
				if (Multiplayer.waitingOnRound()) {
					setWaitingRound(true);
					await Multiplayer.roundOver();
				}
				showResult(effect.source, effect.failed);
				return;
			case 'exit':
				onExit();
				return;
		}
	};

	/** Debug: end the play now. What that means - resolve here, or ask the server
	 *  for the rest of the replay first - is the machine's call, not this one's. */
	const skipToEnd = () => {
		if (!gameRef.current) return;
		dispatch({
			type: 'skip', cursor: offsetCursorRef.current,
		});
	};

	const skipToStart = () => {
		if (!game) return;
		game.update(game.songStartMs);
		// the timeline belongs to the play's owner, so tell it we skipped
		if (play.mode === 'ranked') void skipPlaySession(play.token);
		const clock = clockRef.current;
		if (clock) resumeAt(clock, game.songStartMs);
	};

	Controls.skip.usePress(() => {
		if ((game?.now() ?? Infinity) < ((game?.songStartMs ?? Infinity) - 2000))
			skipToStart();
	});

	// --- debug transport: pause/unpause + 10s seeks ---
	// re-queue hitsounds from song position `t`, dropping anything already scheduled
	// ahead on the audio clock
	const resyncHitsounds = (t: number) => {
		if (!game) return;
		stopScheduledHitsounds();
		let i = 0;
		while (i < game.headHits.length && game.headHits[i].time < t) i++;
		hitsoundPtr.current = i;
		sampleSchedRef.current?.resync(t);
	};
	// re-anchor a running clock so it reads song position `t` and resume audio there.
	const resumeAt = (clock: NonNullable<typeof clockRef.current>, t: number) => {
		clock.leadStart = performance.now() - LEAD_IN_MS - t;
		if (!clock.noAudio) {
			clock.audioStarted = true;
			music.playGameplay(t + music.outputDelay());
		}
		resyncHitsounds(t);
	};

	Controls.pause.usePress(() => {
		const clock = clockRef.current;
		if (!(debug || test) || !clock) return;
		if (clock.pauseAt === undefined) {
			clock.pauseAt = nowRef.current;
			music.pauseGameplay();
			stopScheduledHitsounds();
		} else {
			const t = clock.pauseAt;
			clock.pauseAt = undefined;
			resumeAt(clock, t);
		}
	});

	const seekBy = (delta: number) => {
		const clock = clockRef.current;
		if (!(debug || test) || !clock || !game) return;
		const cur = clock.pauseAt ?? nowRef.current;
		const t = Math.max(0, Math.min(cur + delta, game.songEndMs));
		game.seek(t);
		if (clock.pauseAt !== undefined) {
			clock.pauseAt = t;
			resyncHitsounds(t);
		} else {
			resumeAt(clock, t);
		}
	};
	Controls.seekForward.usePress(() => seekBy(10000));
	Controls.seekBack.usePress(() => seekBy(-10000));

	// A remote abort (another tab/device quitting this play) is pushed over the
	// socket - stop spectating and leave.
	useEffect(() => {
		if (play.mode !== 'ranked') return;
		return Socket.on('play:aborted', msg => {
			// through the machine: a play that already reached its result swallows
			// this instead of leaving the scene out from under the result screen
			if (msg.token === play.token) dispatch({ type: 'abort' });
		});
	}, []);

	// Stream the rest of the replay in. The server only revealed the first few
	// seconds at start (anti-cheat: the client must not know the outcome up
	// front); a `play:watch` arms the server-side feed that pushes the next
	// slices as they clear the reveal buffer, until every offset has arrived.
	// The feed dies with the socket, so it re-arms on every (re)connect from the
	// live cursor.
	useEffect(() => {
		if (play.mode !== 'ranked' || play.done) return;
		const bot = botRef.current;
		if (!(bot instanceof ReplayBot)) return;

		let cursor = play.next;
		// the skip reads this to tell the server where our replay got to; without
		// seeding it, a skip before the first pushed slice asks from 0 and the
		// answer re-appends offsets we already hold
		offsetCursorRef.current = cursor;
		let done = false;
		const offOffsets = Socket.on('play:offsets', msg => {
			if (msg.token !== play.token) return;
			// `done` latches to stop the feed re-appending, but a skip's answer has
			// to get through it: the server can report done with nothing to give
			// (an unknown token), and then this would drop the reply that finishes
			// the play
			if (done && lifecycleRef.current.phase !== 'awaiting-replay') return;
			if (msg.offsets.length) {
				gameRef.current?.appendReplay(bot.addOffsets(maniaOffsets(msg.offsets)));
			}
			serverStrainsRef.current?.add(msg.strains);
			cursor = msg.next;
			offsetCursorRef.current = cursor;
			done = msg.done;

			dispatch({
				type: 'offsets', done: msg.done,
			});
		});
		const rewatch = (open: boolean) => {
			if (open && !done) Socket.send({
				type: 'play:watch', token: play.token, next: cursor,
			});
		};
		void Socket.connected.sync(rewatch);
		return () => {
			offOffsets();
			Socket.connected.desync(rewatch);
		};
	}, []);

	// decode + preload the map's keysounds and storyboard samples (effects channel)
	// and its storyboard video, then build the schedulers. Runs behind the lead-in
	// cover; until it resolves notes just play the default hitsound.
	useEffect(() => {
		let alive = true;
		let videoUrl: string | undefined;
		const setId = beatmapInfo.set.metadata.id;
		void (async () => {
			const assets = await loadStoryboardAssets(beatmapInfo, beatmap);
			if (!alive) return;
			// storyboard times are the map's own: a rate moves them like the notes
			sampleSchedRef.current = new SampleSchedule(assets.samples.map(s => ({
				...s, time: s.time / rate,
			})));
			// keysounds are played per note at press time (see queueHitsounds); only
			// the blobs need preloading here so they trigger with no latency.
			void preloadSamples(setId, [...assets.keysounds, ...assets.samples]);
			if (!assets.video) return;
			videoUrl = await BeatmapStore.getFileUrl(setId, assets.video.file);
			if (!alive || !videoUrl) {
				if (videoUrl) URL.revokeObjectURL(videoUrl);
				return;
			}
			if (videoRef.current) {
				videoInfoRef.current = { time: assets.video.time };
				videoRef.current.src = videoUrl;
			}
		})();
		return () => {
			alive = false;
			if (videoUrl) URL.revokeObjectURL(videoUrl);
		};
	}, [beatmap, beatmapInfo]);

	useEffect(() => {
		if (!game) return;
		const canvas = canvasRef.current!;
		const ctx = canvas.getContext('2d')!;
		const mobile = window.innerWidth < 850;

		let w = 0;
		let h = 0;
		let safeBottom = 0;
		// the whole gameplay frame (playfield + HUD) is drawn by the shared renderer;
		// this scene keeps the clock/audio plumbing and the play-only chrome
		const renderer = new GameplayRenderer(ctx, game, skin);

		const resize = () => {
			w = window.innerWidth;
			h = window.innerHeight;
			safeBottom = parseFloat(getComputedStyle(canvas.parentElement!).paddingBottom) || 0;
			sizeCanvas(canvas, ctx, w, h);
		};
		resize();
		window.addEventListener('resize', resize);

		// background + storyboard video are DOM layers behind the transparent canvas.
		// Resolve the background image into its layer (cover-fit via CSS).
		let bgUrl: string | undefined;
		void BeatmapStore.getBeatmapBackground(beatmap).then((url) => {
			if (!url) return;
			bgUrl = url;
			if (bgRef.current) bgRef.current.style.backgroundImage = `url("${url}")`;
		});

		// keep the native storyboard video tracking the song clock. Plays natively;
		// only nudged when it drifts, when paused, or outside its time range - never
		// drawn per-frame. Hidden until its start and after it ends.
		let lastVideoNow = -Infinity;
		const syncVideo = (now: number) => {
			const video = videoRef.current;
			const info = videoInfoRef.current;
			if (!video || !info || !video.src) return;
			// the video runs in the map's own time, sped up with the music
			const target = (now * rate - info.time) / 1000;
			video.playbackRate = rate;
			const advancing = now > lastVideoNow;
			lastVideoNow = now;
			if (target < 0 || (video.duration && target > video.duration)) {
				video.style.display = 'none';
				if (!video.paused) video.pause();
				return;
			}
			video.style.display = '';
			if (!advancing) {
				if (!video.paused) video.pause();
				return;
			}
			if (video.paused) {
				video.currentTime = target;
				void video.play().catch(() => {});
			} else if (Math.abs(video.currentTime - target) > 0.25) {
				video.currentTime = target;
			}
		};

		const placeGrade = makeGradePlacer();
		const placeMods = makeModsPlacer();
		const placeWarmup = makeWarmupPlacer();
		// the playfield as last drawn, for the SKIP prompt's tap target
		let field: PlayfieldGeometry | undefined;

		// ---- clock: the whole play on a perf timer, the track started in step with it ----
		// persisted in a ref so an HMR effect re-run resumes the same clock
		// instead of restarting the lead-in (which would desync from the audio)
		if (!clockRef.current) {
			clockRef.current = { 
				leadStart: performance.now(), 
				audioStarted: false, 
				paused: true,
			};
			// keep the player's "current beatmap" set (results / menu read it) but stop
			// the streaming preview - gameplay plays a decoded buffer through the shared
			// audio context so the music stays sample-locked to the hitsounds.
			music.beatmap.set(beatmapInfo);
			music.stop();
			const c0 = clockRef.current;
			// decode the track now, during the silent lead-in, so it can start the
			// instant the clock crosses 0. `false` = keysound map (no backing track).
			void music.prepareGameplay(beatmapInfo, rate, SETTINGS.pitchFollowsRate.get()).then((hasAudio) => {
				c0.noAudio = !hasAudio;
				// Anchor the clock to the play's start time so every viewer shows the
				// exact same position: songPos = (now - startedAt) - lead-in. Computed
				// HERE, not earlier - the decode above can take a while, and a stale
				// anchor is what desyncs. A play joined mid-flight lands seeked.
				if (owned) {
					const t = (Date.now() - play.startedAt) - LEAD_IN_MS;
					c0.paused = false;
					if (t >= 0) {
						// already into the song - seek to the live position and start audio there
						const seekTo = Math.min(t, game.songEndMs + 1);
						game.seek(seekTo);
						resumeAt(c0, seekTo);
					} else {
						// still within the lead-in: anchor the countdown to wall-clock; audio
						// starts on its own when the clock crosses 0 (see songTime)
						c0.leadStart = performance.now() - LEAD_IN_MS - t;
					}
					void transition.reveal();
				} else if (test) {
					// a test play starts where the editor was
					const seekTo = Math.min(test.start, game.songEndMs);
					c0.paused = false;
					game.seek(seekTo);
					resumeAt(c0, seekTo);
					void transition.reveal();
				}
			});
		}
		const clock = clockRef.current;
		const songTime = (): number => {
			// frozen at the start of the lead-in until the cover reveals the playfield
			if (clock.paused) return -LEAD_IN_MS;
			// debug pause: clock held at the song position it was paused on
			if (clock.pauseAt !== undefined) return clock.pauseAt;
			const t = performance.now() - clock.leadStart - LEAD_IN_MS;
			// still resolving whether this map has audio - hold just before the
			// start so notes don't begin before we know which clock to run.
			if (clock.noAudio === undefined) return Math.min(t, -0.001);
			// the track starts so its start is heard as the clock crosses 0. The perf timer
			// stays the master clock: the audio clock only moves once per audio callback
			// (10ms on Windows), so frames drawn from it come out choppy.
			if (!clock.noAudio && !clock.audioStarted) {
				const delay = music.outputDelay();
				if (t >= -delay) {
					clock.audioStarted = true;
					music.playGameplay(t + delay);
				}
			}
			return t;
		};

		// keysounds and storyboard samples are part of the song: pitched like its track
		const samplePitch = SETTINGS.pitchFollowsRate.get() ? rate : 1;

		// what each note's sounds play from, once the map's samples are loaded; until
		// then a note plays the default hitsound
		let resolveSound: SoundResolver | undefined;
		void prepareNoteSounds(beatmapInfo.set.metadata.id, game.notes).then(resolve => {
			resolveSound = resolve;
		});

		// Queue hitsounds onto the audio clock up to LOOKAHEAD ahead of the song
		// position. Because they're scheduled (not played reactively), they fire on
		// time even while the tab is blurred, and a tab that resumes after a gap
		// just advances the pointer past the now-stale hits (scheduleHitsound drops
		// anything already in the past) instead of dumping them all at once.
		const queueHitsounds = () => {
			if (finished) return;
			// laid against the track's own clock, so they land with the music
			const now = clock.audioStarted && clock.pauseAt === undefined ? music.gameTime() : songTime();
			const heads = game.headHits;
			while (
				hitsoundPtr.current < heads.length 
				&& heads[hitsoundPtr.current].time <= now + HITSOUND_LOOKAHEAD_MS
			) {
				const { time, note } = heads[hitsoundPtr.current++];
				if (time < now) continue; // already past - drop, don't fire late
				if (!resolveSound) {
					scheduleHitsound(time, now);
					continue;
				}
				for (const sound of note.sounds) {
					const from = resolveSound(sound);
					if (!from) continue;
					effects.play(from.key, {
						atMs: effects.now() + (time - now),
						volume: sound.volume,
						rate: from.mapFile ? samplePitch : 1,
					});
				}
			}
			sampleSchedRef.current?.queue(now, HITSOUND_LOOKAHEAD_MS, 1, samplePitch);
		};
		// a timer (not rAF) so it keeps queueing while the tab is hidden
		const hitsoundTimer = setInterval(queueHitsounds, HITSOUND_TICK_MS);

		let raf = 0;
		let finished = false;
		const comboBreak = makeComboBreakSound();
		let firstFrame = true;
		// once the play ends we keep the playfield scrolling under the result-loading
		// spinner instead of freezing. The song clock can stop advancing when the
		// track hands back to the streaming player, so drive this outro off a plain
		// perf timer anchored at the finish position.
		let outroFrom = 0;
		let outroAt = 0;

		// background fill, then the dimmed cover image. Dim is read live each
		// frame so the slider updates without needing a replay.
		// the canvas is transparent now (background + video are DOM layers below it);
		// just clear it and keep the dim overlay in sync with the live setting.
		let lastDim = -1;
		const drawBackground = () => {
			ctx.clearRect(0, 0, w, h);
			const dim = SETTINGS.backgroundDim.get();
			if (dim !== lastDim && dimRef.current) {
				lastDim = dim;
				dimRef.current.style.opacity = String(Math.max(0, Math.min(1, dim)));
			}
		};

		// play-only chrome the shared renderer doesn't draw: the skip prompt and the
		// per-mode label, both centred on the playfield via the returned geometry
		const drawChrome = (g: PlayfieldGeometry, now: number) => {
			const cxField = g.x0 + g.fieldWidth / 2;
			ctx.textAlign = 'center';

			if (now < (game.songStartMs - 2000) && game.songStartMs > 5000) {
				ctx.fillStyle = '#fff';
				ctx.font = '800 23px "Exo 2", sans-serif';
				ctx.fillText('SKIP', cxField, h * 0.62);
				ctx.fillText('>>>>', cxField, h * 0.64);
			}

			const label = play.mode === 'guest'
				? {
					text: 'Offline play', color: '#ffffff', 
				}
				: play.mode === 'unranked'
					? {
						text: 'Unranked', color: '#bb2727', 
					}
					: test
						? {
							text: 'Test play - no fail', color: '#ff66aa',
						}
						: play.mode === 'debug'
							? {
								text: 'Debug bot - no fail', color: '#63b3ff',
							}
							: undefined;
			if (label) {
				ctx.fillStyle = label.color;
				ctx.font = '800 23px "Exo 2", sans-serif';
				ctx.fillText(label.text, cxField, h * 0.66);
			}
		};

		// the strain HUD source: the playing bot's analysis (set on every play)
		const strain = (): StrainHud | undefined =>
			strainBotRef.current
				? {
					source: strainBotRef.current,
					gauges,
					...play.mode !== 'debug' ? {
						warmupBar: play.warmupBar, warmupLabel, warmupState,
						warmupTrend: play.mode === 'ranked' ? play.warmupTrend : undefined,
					} : {},
				}
				: undefined;

		const draw = () => {
			const now = finished ? outroFrom + (performance.now() - outroAt) : songTime();
			nowRef.current = now;
			game.update(Math.max(0, now));
			comboBreak(game.score.combo);
			queueHitsounds();

			drawBackground();
			syncVideo(now);
			// the renderer derives its own geometry (picks up a live scroll-speed
			// change) and hands it back for the play-only chrome to align to
			renderer.setSkin(currentSkin.get());
			const g = renderer.draw(now, {
				w,
				h,
				scrollMs: scrollMsRef.current,
			}, {
				debug,
				mobile,
				safeBottom,
				strain: strain(),
				onGrade: setGrade,
			});
			field = g;
			placeGrade(gradeRef.current, g);
			placeMods(modsRef.current, g);
			placeWarmup(warmupRef.current, g);
			drawChrome(g, now);
			publishPlayfieldEdge(g);

			// end of map
			if (!finished 
				&& (forceFinishRef.current
					|| game.finished 
					// `now` is song position; a play's endsAt is wall clock. Comparing
					// the two is always false, which left the songEndMs fallback dead
					// and the scene relying on every note being judged.
					|| (now > game.songEndMs
						&& (play.mode === 'debug' || Date.now() > play.endsAt))
				)
			) {
				finished = true;
				// hand the outro clock the live song position so the playfield keeps
				// scrolling seamlessly while the result screen loads
				outroFrom = now;
				outroAt = performance.now();
				dispatch({ type: 'ended' });
			}

			// the playfield is now painted (frozen at the lead-in start). On a genuine
			// first launch - not an HMR resume, where the clock is already running -
			// fade the cover out, then release the clock so gameplay begins on a fully
			// revealed playfield rather than behind the cover. A ranked play reveals
			// itself once its clock is anchored to startedAt (see prepareGameplay), so
			// skip it here.
			if (firstFrame) {
				firstFrame = false;
				if (clock.paused && !owned && !test) {
					void transition.reveal().then(() => {
						const c = clockRef.current;
						if (!c) return;
						c.leadStart = performance.now();
						c.paused = false;
					});
				}
			}

			// keep the loop running after the play ends so the playfield keeps
			// scrolling under the result-loading spinner; it's torn down by the effect
			// cleanup when the scene swaps to RESULT.
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);

		// tap/click the on-canvas "SKIP" prompt to jump to the song start. The
		// prompt is only live while it's actually drawn (before songStart - 2s),
		// matching the keyboard skip binding's gate.
		const onPointerDown = (e: PointerEvent) => {
			if (songTime() >= game.songStartMs - 2000) return;
			const rect = canvas.getBoundingClientRect();
			const px = e.clientX - rect.left;
			const py = e.clientY - rect.top;
			if (!field) return;
			const cxField = field.x0 + field.fieldWidth / 2;
			// bounding box around the SKIP / >>>> text (drawn at h*0.62–0.64)
			if (Math.abs(px - cxField) < 90 && py > h * 0.56 && py < h * 0.68) 
				skipToStart();
		};
		canvas.addEventListener('pointerdown', onPointerDown);

		return () => {
			cancelAnimationFrame(raf);
			clearInterval(hitsoundTimer);
			// drop hitsounds queued ahead on the audio clock so they don't keep
			// firing after we leave (quit mid-play leaves up to LOOKAHEAD queued)
			stopScheduledHitsounds();
			window.removeEventListener('resize', resize);
			canvas.removeEventListener('pointerdown', onPointerDown);
			videoRef.current?.pause();
			if (bgUrl) URL.revokeObjectURL(bgUrl);
		};
	}, [game, debug, transition]);

	if (!game) return <div className="play" />;

	return (
		<div className="play">
			<div ref={bgRef} className="play__bg" />
			<video ref={videoRef} className="play__video" muted playsInline />
			<div ref={dimRef} className="play__dim" />
			<canvas ref={canvasRef} className="play__canvas" />
			{owned && play.warmupBar !== undefined && (
				<WarmupHint bar={play.warmupBar} boxRef={warmupRef} />
			)}
			{!done && <div ref={gradeRef} className='play__grade'>{skin.grade(grade)}</div>}
			<div ref={modsRef} className="play__mods"><ResultMods rate={rate} mods={mods} /></div>
			{done && play.mode === 'ranked' && (
				<div className="play__loading">
					<div className="play__loading-spinner" />
					<Trans>Submitting score…</Trans>
				</div>
			)}
			<div className="play__actions">
				<button
					className="play__abort"
					onClick={onAbort}
					title={t`Stop the play (Esc)`}
				>
					<Trans>abort</Trans>
				</button>
				{owned && (
					<button
						className="play__quit"
						onClick={onQuit}
						title={t`Leave - your character keeps playing`}
					>
						<Trans>quit</Trans>
					</button>
				)}
			</div>
			<div className="play__title">
				{beatmap.metadata.artist} - {beatmap.metadata.title}
				<RatedVersion version={beatmap.metadata.version} rate={rate} />
			</div>

			<SkipToEndButton shown={debug && !done} onSkip={skipToEnd} />
			<MatchScoreboard beatmapId={beatmapInfo.metadata.id} />
			{!playOn && <PlayLeaderboard rows={board} live={live} />}
			{waitingRound && <RoundWaiting />}

			{confirmAbort && (
				<ContextMenu
					title={t`Abort the play?`}
					sub={`${beatmap.metadata.artist} - ${beatmap.metadata.title}`}
					onClose={() => setConfirmAbort(false)}
					numbered
					options={owned
						? [
							{
								label: t`Abort`, color: '#e93100', onClick: abortPlay,
							},
							{
								label: t`Quit, keep playing`, color: '#85b81e', onClick: onQuit,
							},
							{
								label: t`Cancel`, color: '#6b6b6b', onClick: () => setConfirmAbort(false),
							},
						]
						: [
							{
								label: t`Abort`, color: '#e93100', onClick: abortPlay,
							},
							{
								label: t`Cancel`, color: '#6b6b6b', onClick: () => setConfirmAbort(false),
							},
						]}
				/>
			)}
		</div>
	);
}
