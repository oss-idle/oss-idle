import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import Synced from '@oss-idle/shared/helpers/synced';
import type { SkillGain } from '@oss-idle/shared/play';
import type { MedalBatch } from '@oss-idle/shared/play';
import type { ManiaGame } from '@oss-idle/shared/rulesets/mania/maniaGame';
import { ScoreDTO } from '@oss-idle/shared/score';

import { Score } from '../db/schema/score';
import type EditorSession from '../editor/session';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import type { Boot } from './bootPlay';
import type { TestPlay } from './Gameplay';
import IntroScreen from './IntroScreen';
import {
	Editor,
	Gameplay,
	Lobby,
	MatchSetup,
	Result,
	Screensaver,
	SongSelect,
} from './lazy';
import MainMenu from './MainMenu';
import type { SongSelectMode } from './SongSelect';
import { STRAIN_DEBUG_KEY } from './strainDebugKey';
import type { Transition } from './Transition';

export const SCENE = mapped([
	'INTRO',
	'MENU',
	'SELECT',
	'GAME',
	'RESULT',
	'LOBBY',
	'MATCH',
	'SAVER',
	'EDITOR',
]);
export type Scene = ValueIn<typeof SCENE>;

/** Bumped per launch so the gameplay element gets a new key: without one React
 *  reconciles onto the mounted instance, whose boot has already run, and the
 *  next map would replay the last one's chart behind a cover that never lifts. */
let mounts = 0;

const persisted = (import.meta.hot?.data ?? {}) as {
	current?: Synced<Scene>;
	scene?: Synced<JSX.Element>;
	initialized?: boolean;
};

export default class SceneManager {

	private static get = {
		[SCENE.INTRO]: () => <IntroScreen />,
		[SCENE.MENU]: (flash: boolean = false) => <MainMenu flash={flash} />,
		[SCENE.SELECT]: (mode?: SongSelectMode) => <SongSelect mode={mode} />,
		[SCENE.GAME]: (
			beatmapInfo: LightBeatmap, 
			boot: Boot,
			transition: Transition, 
			test?: TestPlay,
		) => <Gameplay 
			key={++mounts}
			beatmapInfo={beatmapInfo}
			{...boot}
			transition={transition} 
			test={test}
		/>,
		[SCENE.RESULT]: (
			score: Score | ScoreDTO,
			game?: ManiaGame,
			progression?: SkillGain[],
			failed?: boolean,
			beatmap?: LightBeatmap,
			medals?: MedalBatch,
		) => <Result
			game={game}
			score={score}
			progression={progression}
			failed={failed}
			beatmap={beatmap}
			medals={medals}
		/>,

		[SCENE.LOBBY]: () => <Lobby />,
		[SCENE.MATCH]: () => <MatchSetup />,
		[SCENE.SAVER]: () => <Screensaver />,
		[SCENE.EDITOR]: (beatmap: LightBeatmap, session?: EditorSession, fresh?: boolean) =>
			<Editor key={beatmap.metadata.id} beatmap={beatmap} resume={session} fresh={fresh} />,

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as const satisfies Record<Scene, (...args: any[]) => JSX.Element>;

	public static current = (persisted.current ??= new Synced<Scene>(SCENE.INTRO));
	public static scene = (persisted.scene ??= new Synced<JSX.Element>(<></>));

	public static set<S extends Scene>(
		scene: S, 
		...args: Parameters<typeof SceneManager['get'][S]>
	) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.scene.set((this.get[scene] as any)(...args));
		this.current.set(scene);
	}

}

if (!persisted.initialized) {
	persisted.initialized = true;
	// dev: a skill edit forces a full reload, wiping the in-memory scene. If the
	// strain debug was open, boot straight back into song select so it reopens.
	if (import.meta.env.DEV && sessionStorage.getItem(STRAIN_DEBUG_KEY)) {
		SceneManager.set(SCENE.SELECT);
	} else {
		SceneManager.set(SCENE.INTRO);
	}
}