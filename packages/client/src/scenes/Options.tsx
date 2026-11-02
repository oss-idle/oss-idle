import './Options.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import AutopilotDelay from '../components/options/AutopilotDelay';
import AutopilotMode from '../components/options/AutopilotMode';
import BackgroundDim from '../components/options/BackgroundDim';
import BestGradeAnyRate from '../components/options/BestGradeAnyRate';
import BrowseAddons from '../components/options/BrowseAddons';
import BrowseSkins from '../components/options/BrowseSkins';
import CursorSize from '../components/options/CursorSize';
import DeleteAllBeatmaps from '../components/options/DeleteAllBeatmaps';
import DownloadAllBundled from '../components/options/DownloadAllBundled';
import DownloadAllRanked from '../components/options/DownloadAllRanked';
import EditorSkin from '../components/options/EditorSkin';
import EffectVolume from '../components/options/EffectVolume';
import FrameLimiter from '../components/options/FrameLimiter';
import Fullscreen from '../components/options/Fullscreen';
import GameplaySkin from '../components/options/GameplaySkin';
import KeepPlaying from '../components/options/KeepPlaying';
import Language from '../components/options/Language';
import LinkDiscord from '../components/options/LinkDiscord';
import ManageAddons from '../components/options/ManageAddons';
import ManageSkins from '../components/options/ManageSkins';
import MasterVolume from '../components/options/MasterVolume';
import MentionPings from '../components/options/MentionPings';
import MoveInstall from '../components/options/MoveInstall';
import MusicVolume from '../components/options/MusicVolume';
import OpenLibraryFolders from '../components/options/OpenLibraryFolders';
import OsuMusicTheme from '../components/options/OsuMusicTheme';
import ParallaxMode from '../components/options/ParallaxMode';
import PitchFollowsRate from '../components/options/PitchFollowsRate';
import PmFromAnyone from '../components/options/PmFromAnyone';
import RecreateDatabase from '../components/options/RecreateDatabase';
import ReportBug from '../components/options/ReportBug';
import RightClickHold from '../components/options/RightClickHold';
import ShowFPS from '../components/options/ShowFPS';
import ShowThumbnails from '../components/options/ShowThumbnails';
import ShowUnbundled from '../components/options/ShowUnbundled';
import ShowUndownloaded from '../components/options/ShowUndownloaded';
import SignIn from '../components/options/SignIn';
import UIScaling from '../components/options/UIScaling';
import { isOptionsOpen } from '../globals';
import useKeyboardOwner, { LAYER } from '../input/keyboardOwner';
import AutoSkip from '../pbe/AutoSkip';
import { PBE } from '../pbe/pbe';
import ResetCharacter from '../pbe/ResetCharacter';

/** A consumer component rendered inside a group. */
type OptComponent = () => JSX.Element;

export default function Options() {
	const { t } = useLingui();
	const [open] = useSynced(isOptionsOpen);
	const [query, setQuery] = useState('');
	const [active, setActive] = useState<string | null>(null);

	const CATEGORY = mapped([
		'GENERAL',
		'GRAPHICS',
		'GAMEPLAY',
		'SKIN',
		'CONTROLS',
		'EDITOR',
		'ADDONS',
		'MAINTENANCE',
	]);
	type Category = ValueIn<typeof CATEGORY>;

	const CATEGORY_LABEL: Record<Category, string> = {
		[CATEGORY.GENERAL]: t`GENERAL`,
		[CATEGORY.GRAPHICS]: t`GRAPHICS`,
		[CATEGORY.GAMEPLAY]: t`GAMEPLAY`,
		[CATEGORY.SKIN]: t`SKIN`,
		[CATEGORY.CONTROLS]: t`CONTROLS`,
		[CATEGORY.EDITOR]: t`EDITOR`,
		[CATEGORY.ADDONS]: t`ADD-ONS`,
		[CATEGORY.MAINTENANCE]: t`MAINTENANCE`,
	};

	type CategoryDisplay = {
		name: Category,
		groups: {
			title: string,
			components: {
				search: string,
				component: () => OptComponent,
			}[]
		}[],
	};

	const Categories: CategoryDisplay[] = [
		{
			name: CATEGORY.GENERAL,
			groups: [
				{
					title: t`Sign in`,
					components: [
						{
							search: t`sign|in|login|connect|connexion`,
							component: () => SignIn,
						},
						// no Discord bot on the PBE
						...PBE ? [] : [{
							search: t`discord|link|role`,
							component: () => LinkDiscord,
						}],
						{
							search: t`bug|report|issue|problem|crash|help`,
							component: () => ReportBug,
						},
					],
				},
				...PBE ? [{
					title: 'PBE',
					components: [
						{
							search: 'pbe|skip|end|instant|auto',
							component: () => AutoSkip,
						},
						{
							search: 'pbe|reset|character|delete',
							component: () => ResetCharacter,
						},
					],
				}] : [],
				{
					title: t`Chat`,
					components: [
						{
							search: t`chat|message|private|pm|friends`,
							component: () => PmFromAnyone,
						},
						{
							search: t`chat|mention|ping|notification|sound|@`,
							component: () => MentionPings,
						},
					],
				},
				{
					title: t`Language`,
					components: [
						{
							search: t`language|locale`,
							component: () => Language,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.GRAPHICS,
			groups: [
				{
					title: t`Renderer`,
					components: [
						{
							search: t`fps|frame|rate|refresh|hz|limit|vsync`,
							component: () => FrameLimiter,
						},
						{
							search: t`fps|frame|rate|refresh|hz`,
							component: () => ShowFPS,
						},
					],
				},
				{
					title: t`Layout`,
					components: [
						{
							search: t`fullscreen`,
							component: () => Fullscreen,
						},
						{
							search: t`ui|scale|scaling|zoom|size`,
							component: () => UIScaling,
						},
					],
				},
				{
					title: t`Main menu`,
					components: [
						{
							search: t`parallax`,
							component: () => ParallaxMode,
						},
						{
							search: t`osu|music|theme`,
							component: () => OsuMusicTheme,
						},
					],
				},
				{
					title: t`Song select`,
					components: [
						{
							search: t`thumb|thumbnail`,
							component: () => ShowThumbnails,
						},
						{
							search: t`grade|grades|rank|rate|best`,
							component: () => BestGradeAnyRate,
						},
						{
							search: t`download|downloaded|beatmap|beatmaps|hide`,
							component: () => ShowUndownloaded,
						},
						{
							search: t`download|downloaded|beatmap|beatmaps|bundled|ranked|loved`,
							component: () => ShowUnbundled,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.GAMEPLAY,
			groups: [
				{
					title: t`General`,
					components: [
						{
							search: t`background|dim|opacity`,
							component: () => BackgroundDim,
						},
						{
							search: t`autopilot|delay|restart`,
							component: () => AutopilotDelay,
						},
						{
							search: t`autopilot|mode|playlist|loop|next|song|disabled`,
							component: () => AutopilotMode,
						},
						{
							search: t`autopilot|queue|offline|closed|keep|playing`,
							component: () => KeepPlaying,
						},
					],
				},
				{
					title: t`Volume`,
					components: [
						{
							search: t`volume`,
							component: () => MasterVolume,
						},
						{
							search: t`volume`,
							component: () => MusicVolume,
						},
						{
							search: t`volume`,
							component: () => EffectVolume,
						},
						{
							search: t`pitch|rate|speed|double|half|nightcore|mods`,
							component: () => PitchFollowsRate,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.SKIN,
			groups: [
				{
					title: t`Skinning`,
					components: [
						{
							search: t`skin|skins|current|select|gameplay`,
							component: () => GameplaySkin,
						},
						{
							search: t`skin|skins|manage|installed`,
							component: () => ManageSkins,
						},
						{
							search: t`skin|skins|browse|catalog|install`,
							component: () => BrowseSkins,
						},
						{
							search: t`cursor|size|scale`,
							component: () => CursorSize,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.CONTROLS,
			groups: [
				{
					title: t`General`,
					components: [
						{
							search: t`right|click|hold|time`,
							component: () => RightClickHold,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.EDITOR,
			groups: [
				{
					title: t`General`,
					components: [
						{
							search: t`skin|skins|editor|select`,
							component: () => EditorSkin,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.ADDONS,
			groups: [
				{
					title: t`Add-ons`,
					components: [
						{
							search: t`addon|addons|add-on|mod|mods|manage|installed`,
							component: () => ManageAddons,
						},
						{
							search: t`addon|addons|add-on|mod|mods|browse|catalog|install`,
							component: () => BrowseAddons,
						},
					],
				},
			],
		},
		{
			name: CATEGORY.MAINTENANCE,
			groups: [
				{
					title: t`General`,
					components: [
						{
							search: t`download|beatmap|beatmaps|bundled|supporter`,
							component: () => DownloadAllBundled,
						},
						{
							search: t`download|beatmap|beatmaps|ranked|supporter`,
							component: () => DownloadAllRanked,
						},
						{
							search: t`open|folder|beatmap|beatmaps|maps|skins|add-ons|addons|files`,
							component: () => OpenLibraryFolders,
						},
						{
							search: t`delete|beatmap|beatmaps`,
							component: () => DeleteAllBeatmaps,
						},
						{
							search: t`move|install|installation|folder|location|portable`,
							component: () => MoveInstall,
						},
						{
							search: t`database|local|reset|recreate|repair|fresh`,
							component: () => RecreateDatabase,
						},
						{
							search: t`bug|report|issue|problem|crash|help`,
							component: () => ReportBug,
						},
					],
				},
			],
		},
	];

	// A component is visible when the query is empty or matches its group title
	// or its `search` keywords; a group/category with nothing visible is dropped.
	const q = query.trim().toLowerCase();
	const visible = Categories
		.map(category => ({
			name: category.name,
			groups: category.groups
				.map(group => ({
					title: group.title,
					components: group.components.filter(c =>
						!q || `${group.title}|${c.search}`.toLowerCase().includes(q)),
				}))
				.filter(group => group.components.length > 0),
		}))
		.filter(category => category.groups.length > 0);

	const scrollRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

	const scrollTo = (name: string) => {
		categoryRefs.current[name]?.scrollIntoView({ 
			behavior: 'smooth', 
			block: 'start',
		});
	};

	// Highlight the topmost category in the sidebar as the panel scrolls.
	const onScroll = () => {
		const top = scrollRef.current?.getBoundingClientRect().top ?? 0;
		let current: string | null = null;
		for (const category of visible) {
			const el = categoryRefs.current[category.name];
			if (el && el.getBoundingClientRect().top - top <= 24) current = category.name;
		}
		setActive(current ?? visible[0]?.name ?? null);
	};

	// The panel keeps its scroll position across opens; sync the sidebar to it.
	useEffect(() => {
		if (open) onScroll();
	}, [open]);
	useKeyboardOwner(searchRef, {
		active: open, layer: LAYER.OPTIONS, close: () => isOptionsOpen.set(false),
	});

	const close = () => isOptionsOpen.set(false);

	return (
		<div
			className={`options__container ${open ? 'open' : ''}`}
			onClick={(e) => { if (e.target === e.currentTarget) close(); }}
		>
			{/* left side bar: one button per category, scrolling to it (dimmed when
			    the active search hides every group it owns) */}
			<div className='options__quick_access'>
				{Categories.map(category => {
					const shown = visible.some(c => c.name === category.name);
					return (
						<button
							key={category.name}
							type='button'
							className={
								`options__tab ${active === category.name ? 'is-active' : ''} ${shown ? '' : 'is-empty'}`
							}
							disabled={!shown}
							onClick={() => scrollTo(category.name)}
						>
							{CATEGORY_LABEL[category.name]}
						</button>
					);
				})}
			</div>

			<div className='options__panel'>
				<div className='options__scroll' ref={scrollRef} onScroll={onScroll}>
					<div className='options__heading'><Trans>Options</Trans></div>
					<div className='options__subheading'>
						<Trans>Change the way oss!idle behaves</Trans>
					</div>

					<label className='options__search'>
						<svg className='options__search_icon' viewBox='0 0 24 24' aria-hidden>
							<path 
								fill='currentColor' 
								d={
									'M9.5 3a6.5 6.5 0 0 1 5.06 10.58l5.43 5.43-1.42 1.42-5.43-5.43A6.5 6.5 0 1 1 9.5 3m0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9'
								}
							/>
						</svg>
						<input
							ref={searchRef}
							className='options__search_input'
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t`Type to search!`}
						/>
					</label>
					{visible.map(category => (
						<div
							key={category.name}
							className='options__category'
							ref={(el) => { categoryRefs.current[category.name] = el; }}
						>
							<div className='options__category_title'>{CATEGORY_LABEL[category.name]}</div>
							{category.groups.map(group => (
								<div className='options__group' key={group.title}>
									<div className='options__group_title'>{group.title}</div>
									{group.components.map((c, i) => {
										const Component = c.component();
										return <Component key={i} />;
									})}
								</div>
							))}
						</div>
					))}

					{visible.length === 0 && (
						<div className='options__empty'><Trans>No matching settings.</Trans></div>
					)}
				</div>
			</div>
		</div>
	);
}
