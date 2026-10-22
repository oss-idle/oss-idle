import {
	useCallback,
	useEffect,
	useState,
} from 'react';
import IdleLogo from '../components/IdleLogo';
import LogoVisualizer from '../components/LogoVisualizer';
import {
	music,
	PLAYER_MODE,
} from '../audio/MusicPlayer';
import './MainMenu.css';
import Background from './Background';
import Multiplayer from '../online/multiplayer';
import SceneManager, { SCENE } from './SceneManager';
import Device from '../responsive/Device';
import { useParallax } from '@oss-idle/shared/hooks/useParallax';
import Announce from '../components/Announce';
import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import { useLingui } from '@lingui/react/macro';
import Controls from '../input/Controls';
import normalize from '@oss-idle/shared/math/normalize';
import {
	isOptionsOpen,
	isWebOpen,
	webUrl,
} from '../globals';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import Entities from '../entity/entities';
import { SETTINGS } from '../db/settings';
import { VERSION } from '@oss-idle/shared/version';
import DesktopUpdate from '../components/DesktopUpdate';
import SupporterHeart from '../components/SupporterHeart';
import { currentSkin } from '../osu/skin/Skin';
import Auth from '../online/auth';
import ContextMenu from '../components/ContextMenu';
import ConfirmMenu from '../components/ConfirmMenu';
import PlayManager from '../online/playManager';
import { desktop } from '@oss-idle/shared/desktop';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDiscord } from '@fortawesome/free-brands-svg-icons/faDiscord';
import { DISCORD_URL } from '@oss-idle/shared/links';
import { effects } from '../audio/EffectPlayer';
import sleep from '@oss-idle/shared/helpers/sleep';

/** stable's goodbye takes about two seconds from the click to black */
const EXIT_FADE_MS = 2000;
/** how long the window stays up after the seeya ends, so its tail isn't cut */
const SEEYA_TAIL_MS = 600;

interface Props {
	/** play the white-flash "drop" entrance (true when arriving from the intro) */
	flash?: boolean
}

const MENU = mapped(['CLOSED', 'OPEN', 'PLAY']);
type Menu = ValueIn<typeof MENU>;

const OPTION = mapped([
	'PLAY',
	'WEBSITE', 
	'OPTIONS', 
	'EXIT', 
	'SOLO',
	'MULTI',
	'BACK',
]);
type Option = ValueIn<typeof OPTION>;

type OptionDisplay = {
	menu: Menu,
	title: string,
	band: 'out' | 'mid',
	flip: boolean,
	order: number,
	disabled?: true,
	onSelect: () => void,
};

export default function MainMenu({ flash = false }: Props) {
	music.mode.set(PLAYER_MODE.PLAYLIST);

	const closeTimeout = 500000;
	const { t } = useLingui();
	const [menu, setMenu] = useState<Menu>(MENU.CLOSED);
	const [exitConfirm, setExitConfirm] = useState(false);
	const [multiConfirm, setMultiConfirm] = useState(false);
	const [parallaxOn] = useSynced(SETTINGS.parallax);
	const parallax = useParallax(0.08, parallaxOn);
	const [character] = useSynced(Entities.character);
	const [skin] = useSynced(currentSkin);
	const [user] = useSynced(Auth.user);

	const getLogoSize = () => Math.min(window.innerHeight * 0.5, window.innerWidth * 0.75);

	const [logoSize, setLogoSize] = useState(getLogoSize());
	useEffect(() => Device.resize.on(() => setLogoSize(getLogoSize())), []);

	let cancelTimeout = 0;
	const mainClick = useCallback(() => {
		clearTimeout(cancelTimeout);
		cancelTimeout = setTimeout(() => setMenu(MENU.CLOSED), closeTimeout);
		switch(menu) {
			case MENU.CLOSED:
				setMenu(MENU.OPEN);
				break;
			case MENU.OPEN:
				setMenu(MENU.PLAY);
				break;
			case MENU.PLAY:
				toSongSelect();
				break;
		}
	}, [menu]);

	const toSongSelect = () => {
		clearTimeout(cancelTimeout);
		SceneManager.set(SCENE.SELECT);
	};

	// Exit only works in the desktop app; the browser forbids closing its own tab.
	const isDesktop = !!desktop();
	// goodbye like stable's: the buttons go, the skin's seeya plays, the logo winds down while
	// the music and the screen fade out over EXIT_FADE_MS, and the app quits once the screen is
	// black and the seeya is done
	const [exiting, setExiting] = useState(false);
	const exit = async () => {
		if (exiting) return;
		setExiting(true);
		setExitConfirm(false);
		setMenu(MENU.CLOSED);
		music.fadeOut(EXIT_FADE_MS);
		const seeya = skin.data.menu.seeya;
		const voice = seeya ? await effects.load(seeya, seeya) : undefined;
		if (seeya && voice) effects.play(seeya);
		// everything on the page fades, chat and overlays included (index.css html.exiting)
		document.documentElement.classList.add('exiting');
		await Promise.all([
			sleep(EXIT_FADE_MS),
			// let the seeya ring out: stable keeps the window up a little after the voice ends
			voice ? sleep(voice.duration * 1000 + SEEYA_TAIL_MS) : undefined,
		]);
		desktop()?.quit();
	};
	// back also reaches the panels drawn over the menu: read them as they were when it was pressed
	const [webOpen] = useSynced(isWebOpen);
	const [optionsOpen] = useSynced(isOptionsOpen);

	const back = useCallback(() => {
		clearTimeout(cancelTimeout);
		cancelTimeout = setTimeout(() => setMenu(MENU.CLOSED), closeTimeout);
		switch(menu) {
			case MENU.CLOSED:
				// back from the closed menu asks to exit, like the Exit option; back again confirms it
				if (!isDesktop || webOpen || optionsOpen) break;
				if (exitConfirm) void exit();
				else setExitConfirm(true);
				break;
			case MENU.OPEN:
				setMenu(MENU.CLOSED);
				break;
			case MENU.PLAY:
				setMenu(MENU.OPEN);
				break;
		}
	}, [menu, webOpen, optionsOpen, exitConfirm]);

	Controls.back.usePress(back);

	const OPTION_DISPLAY: Record<Option, OptionDisplay> = {
	// Main menu
		[OPTION.PLAY]: {
			menu: MENU.OPEN,
			title: t`Play`,
			band: 'out',
			flip: false,
			order: 1,
			onSelect: () => setMenu(MENU.PLAY),
		},
		[OPTION.WEBSITE]: {
			menu: MENU.OPEN,
			title: t`Website`,
			band: 'mid',
			flip: false,
			order: 2,
			onSelect: async () => {
				if (character.isGuest()) { Auth.signIn(); return; }
				await webUrl.set(`c/${character.id}`);
				await isWebOpen.set(true);
			},
		},
		[OPTION.OPTIONS]: {
			menu: MENU.OPEN,
			title: t`Options`,
			band: 'mid',
			flip: true,
			order: 3,
			onSelect: () => { isOptionsOpen.set(!isOptionsOpen.get()); },
		},
		[OPTION.EXIT]: {
			menu: MENU.OPEN,
			title: t`Exit`,
			band: 'out',
			flip: true,
			order: 4,
			disabled: isDesktop ? undefined : true,
			onSelect: () => { if (isDesktop) setExitConfirm(true); },
		},

		// Play menu
		[OPTION.SOLO]: {
			menu: MENU.PLAY,
			title: t`Solo`,
			band: 'out',
			flip: false,
			order: 1,
			onSelect: toSongSelect,
		},
		[OPTION.MULTI]: {
			menu: MENU.PLAY,
			title: t`Multi`,
			band: 'mid',
			flip: false,
			disabled: character.isGuest() ? true : undefined,
			order: 2,
			onSelect: () => {
				if (character.isGuest()) return;
				clearTimeout(cancelTimeout);
				if (Multiplayer.current.get()) SceneManager.set(SCENE.MATCH);
				else if (PlayManager.live.get()) setMultiConfirm(true);
				else SceneManager.set(SCENE.LOBBY);
			},
		},
		[OPTION.BACK]: {
			menu: MENU.PLAY,
			title: t`Back`,
			band: 'out',
			flip: true,
			order: 3,
			onSelect: () => setMenu(MENU.OPEN),
		},
	};

	// foreground content drifts opposite the background for depth
	const fgX = -parallax.x * 18;
	const fgY = -parallax.y * 18;

	const mobileShift = 1 - normalize(window.innerWidth, [400, 850]);

	return (
		<div className={[
			'menu',
			flash ? 'menu--flash' : '',
			menu === MENU.CLOSED ? '' : 'menu--open',
			exiting ? 'menu--exiting' : '',
		].join(' ')}>
			<Background image={user?.supporter ? skin.data.menu.background : undefined} />
			<div className="menu__vignette" />

			<header className="menu__top">
			</header>
			<div className="menu__brand">
				<span className="menu__brand-name">oss!</span>
				<span className="menu__brand-tag">idle</span>
				<span className="menu__brand-version">v{VERSION}</span>
				<a
					className="menu__discord"
					href={DISCORD_URL}
					target="_blank"
					rel="noreferrer"
					aria-label="Discord"
				>
					<FontAwesomeIcon icon={faDiscord} />
				</a>
			</div>

			<SupporterHeart />

			<div className="menu__center" style={{ transform: `translate(${fgX}px, ${fgY}px)` }}>
				<div className='menu__logo-options' style={{
					height: `${logoSize}px`,
					width: `${logoSize}px`,
					transform: `translate(${menu === MENU.CLOSED ? 'calc(-50%)' : `calc(-50% + ${Math.floor(logoSize / 2) - (mobileShift * logoSize / 2)}px)`}, -50%)`,
				}}>
					{Object.entries(Object.values(OPTION_DISPLAY)
						.sort((a, b) => a.order - b.order)
						.reduce((acc, option) => {
							if (!acc[option.menu]) acc[option.menu] = [];
							acc[option.menu].push(option);
							return acc;
						}, {} as Record<Menu, OptionDisplay[]>))
						.map(([currentMenu, group]) => (
							<div
								key={currentMenu}
								className={`menu__option_group ${menu === currentMenu ? 'visible' : ''}`}
								style={{ width: `${logoSize * 1.2}px` }}
							>
								{group.map(option => <div
									key={option.title}
									className={
										`menu__option ${option.band} ${menu === option.menu ? 'visible' : ''} ${option.flip ? 'flip' : ''} ${option.disabled ? 'disabled' : ''}`
									}
									onClick={option.onSelect}
								>
									<div className='menu__option_bg_safe'>
										<div 
											className='menu__option_bg' 
											style={{ backgroundImage: `url('/band_${option.band}.png')` }}
										>
										</div>
									</div>
									<div className='menu__option_bg_safe on'>
										<div 
											className='menu__option_bg' 
											style={{ backgroundImage: `url('/band_${option.band}_on.png')` }}
										>
										</div>
									</div>
									<div className='menu_option_contents'>
										{option.title}
									</div>
								</div>)}
							</div>
						))}
				</div>
				<div 
					className="menu__logo-menu" 
					style={{
						transform: `translateX(${menu === MENU.CLOSED ? 
							'0px' 
							: `-${(logoSize / 2) + (mobileShift * logoSize / 2)}px`})`,
					}}
				>
					<div className="menu__logo-enter">
						<LogoVisualizer size={logoSize} />
						<IdleLogo size={logoSize} onClick={mainClick} />
					</div>
				</div>
			</div>

			<Announce />
			<DesktopUpdate />

			{exitConfirm && (
				<ContextMenu
					title={t`Exit oss!idle`}
					sub={t`Are you sure you want to quit?`}
					onClose={() => setExitConfirm(false)}
					options={[
						{
							label: t`Exit`, color: '#e93100', onClick: () => void exit(), 
						},
						{
							label: t`Cancel`, color: '#6b6b6b', onClick: () => setExitConfirm(false), 
						},
					]}
				/>
			)}

			{multiConfirm && (
				<ConfirmMenu
					title={t`A play is running`}
					sub={t`Abort it to play multiplayer?`}
					confirmLabel={t`Abort`}
					onConfirm={() => void PlayManager.abort().then(() => SceneManager.set(SCENE.LOBBY))}
					onClose={() => setMultiConfirm(false)}
				/>
			)}

			{flash && <div className="menu__flash" />}
		</div>
	);
}
