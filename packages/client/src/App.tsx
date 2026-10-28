import './audio/musicSpeed';
import './online/versionWatch';
import './online/libraryUpdates';
import './online/characterWatch';
import './online/mapLinks';
import './osu/beatmap/oszImport';
import './editor/songDrop';

import {
	lazy,
	Suspense,
	useEffect,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import CommunityOverlay from './components/community/CommunityOverlay';
import ConfirmPrompt from './components/ConfirmPrompt';
import Cursor from './components/Cursor';
import DirectLinkPanel from './components/direct/DirectLinkPanel';
import PlayDock from './components/dock/PlayDock';
import FloatingDeltas from './components/FloatingDeltas';
import FpsCounter from './components/FpsCounter';
import ShownMedals from './components/medals/ShownMedals';
import Message from './components/Message';
import OldHostPrompt from './components/OldHostPrompt';
import Onboarding from './components/Onboarding';
import PageOverlay from './components/page/PageOverlay';
import PlayChoice from './components/PlayChoice';
import Popups from './components/Popups';
import RestrictedNotice from './components/RestrictedNotice';
import Tutorial from './components/Tutorial';
import VolumeOverlay from './components/VolumeOverlay';
import WebBrowser from './components/WebBrowser';
import {
	DEV_TOOLS,
	devTools,
} from './dev/devTools';
import { isMobile } from './globals';
import Multiplayer from './online/multiplayer';
import PlayManager from './online/playManager';
import Presence from './online/presence';
import Socket from './online/socket';
import { prefetchRulesets } from './rulesets/registry';
import { prefetchScenes } from './scenes/lazy';
import Options from './scenes/Options';
import SceneManager from './scenes/SceneManager';
import TransitionOverlay from './scenes/Transition';
import MenuWarmup from './warmup/MenuWarmup';

PlayManager.start();
Presence.start();
Socket.start();
Multiplayer.start();

/** Dev-only component bench; see dev/Playground.tsx. Checked once at load so a
 *  release build drops the whole tree. Dev opens it with `?playground`, staging
 *  from its startup menu. */
const Playground = lazy(() => import('./dev/Playground'));
const playground = DEV_TOOLS && (import.meta.env.DEV
	? new URLSearchParams(location.search).has('playground')
	: devTools.playground);

export default function App() {
	const [scene] = useSynced(SceneManager.scene);
	// the rest of the game loads once the first scene shows (the intro, most often)
	useEffect(() => {
		prefetchScenes();
		prefetchRulesets();
	}, []);

	if (playground) return <Suspense fallback={null}><Playground /></Suspense>;

	return (
		<>
			<RestrictedNotice />
			<MenuWarmup />
			<Suspense fallback={null}>{scene}</Suspense>
			<PageOverlay />
			<DirectLinkPanel />
			<PlayDock />
			<ConfirmPrompt />
			<TransitionOverlay />
			<PlayChoice />
			<Onboarding />
			<Tutorial />
			<OldHostPrompt />
			<Message />
			<Options />
			<VolumeOverlay />
			<WebBrowser />
			<CommunityOverlay />
			<FloatingDeltas />
			<ShownMedals />
			<Popups />
			<FpsCounter />
			{!isMobile && <Cursor />}
		</>
	);
}
