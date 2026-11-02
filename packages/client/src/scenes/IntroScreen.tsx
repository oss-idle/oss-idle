import './IntroScreen.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import sleep from '@oss-idle/shared/helpers/sleep';

import { music } from '../audio/MusicPlayer';
import { SETTINGS } from '../db/settings';
import {
	isMobile,
	isStandalone,
} from '../globals';
import BeatmapSet from '../osu/beatmap/beatmap_set';
import BeatmapStore from '../osu/beatmap/beatmap_store';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import { acquireWakeLock } from '../responsive/wakeLock';
import { menuWarmed } from '../warmup/menuWarmed';
import SceneManager, { SCENE } from './SceneManager';

const INTRO_MS = 2500;
const SONG_KICK = 2450;
/** the longest the desktop intro waits for the menu's warm-up */
const WARMUP_WAIT_MS = 4000;

async function pickStartupBeatmap(): Promise<{ 
	beatmap?: LightBeatmap; 
	random: boolean 
}> {
	if (!SETTINGS.osuMusicTheme.get()) {
		const playable = (await BeatmapStore.getAllSets())
			.flatMap(set => set.getPickedBeatmaps());
		if (playable.length) return { 
			beatmap: playable[Math.floor(Math.random() * playable.length)], 
			random: true, 
		};
	}
	return {
		beatmap: (await BeatmapSet.getIntro()).beatmaps[0], random: false, 
	};
}

export default function IntroScreen() {
	const [started, setStarted] = useState(false);
	const handled = useRef(false);
	const startMs = useRef(0);
	const holdMs = useRef(0);
	const preloaded = useRef(0);

	const begin = () => {
		if (handled.current) return;
		handled.current = true;
		setStarted(true);
		
		if (startMs.current > 0) music.fadeIn();
		if (holdMs.current > 0) {
			setTimeout(() => music.play(0), holdMs.current);
		} else {
			void music.play(startMs.current);
		}
		void acquireWakeLock();

		setTimeout(() => {
			SceneManager.set(SCENE.MENU, true);
		}, INTRO_MS);
	};

	/** The song the intro starts, loaded and placed on its first beat. */
	const prepare = async () => {
		const { beatmap, random } = await pickStartupBeatmap();
		if (!beatmap) return;
		await music.beatmap.set(beatmap);

		if (random) {
			const loaded = await beatmap.load();
			const firstBeat = loaded.controlPoints.timingPoints[0]?.startTime ?? 0;
			if (firstBeat > SONG_KICK) {
				holdMs.current = 0;
				startMs.current = firstBeat - SONG_KICK;
			}
			if (firstBeat < SONG_KICK) {
				startMs.current = 0;
				holdMs.current = SONG_KICK - firstBeat;
			}
		}
		await music.preload(startMs.current);
	};

	useEffect(() => {
		void (async () => {
			if (preloaded.current) return;
			preloaded.current = 1;
			try {
				await prepare();
			} catch (e) {
				console.error('[intro] the startup song did not load', e);
			}
			// desktop can start audio without a user gesture (autoplayPolicy): no click
			// gate, and the intro starts whatever the song or the warm-up did
			if (isStandalone.get()) {
				await Promise.race([menuWarmed, sleep(WARMUP_WAIT_MS)]);
				begin();
			}
		})();
	}, []);

	// desktop starts on its own: nothing to click, and nothing shows until the welcome
	const desktop = isStandalone.get();

	return (
		<div
			className={`intro ${started ? 'intro--started' : desktop ? 'intro--waiting' : ''}`}
			onClick={desktop ? undefined : begin}
		>
			<div className="intro__frame" />
			<div className="intro__inner">
				{!desktop && <p className="intro__cta">{isMobile ? 
					<Trans>tap to play...</Trans> 
					: <Trans>click to play...</Trans>} </p>}
				<h1 className="intro__welcome">
					<span>welcome</span>
				</h1>
			</div>
			<div className="intro__disclaimer">
				<Trans>This game is an unofficial, fanmade version of osu!stable and is not affiliated with osu.ppy.sh</Trans>
			</div>
		</div>
	);
}
