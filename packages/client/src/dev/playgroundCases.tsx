import '../components/community/chat/Chat.css';
import '../components/addons/addons.css';

import type { ReactNode } from 'react';

import { ADDON_KIND } from '@oss-idle/shared/addon';
import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import {
	ANNOUNCE_CHANNEL,
	type ChatLine,
} from '@oss-idle/shared/community/wire';
import type { Grade } from '@oss-idle/shared/grade';
import type { Mod } from '@oss-idle/shared/mods';
import type { Match } from '@oss-idle/shared/multiplayer';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import type { SkillProgress } from '@oss-idle/shared/rulesets/mania/4k/bots/character';
import { makeOrderedSkills } from '@oss-idle/shared/rulesets/mania/4k/skills/factory';
import Skill from '@oss-idle/shared/rulesets/mania/4k/skills/skill';
import {
	JUDGEMENT,
	Judgements,
} from '@oss-idle/shared/rulesets/mania/judgement';
import type {
	HitRecord,
	ManiaGame,
} from '@oss-idle/shared/rulesets/mania/maniaGame';
import {
	judge,
	maniaWindows,
	ScoreState,
} from '@oss-idle/shared/rulesets/mania/scoring';
import type {
	JudgementCounts,
	ScoreDTO,
} from '@oss-idle/shared/score';

import type { MedalUnlock } from '../achievements/medalUnlocks';
import AddonView, {
	detailOfDTO,
	newAddonDetail,
} from '../components/addons/AddonView';
import InstalledAddonRow from '../components/addons/InstalledAddonRow';
import CharactersTable from '../components/character/CharactersTable';
import PrestigeClimaxxPop from '../components/character/PrestigeClimaxxPop';
import PrestigeView from '../components/character/PrestigeView';
import ChannelPicker from '../components/community/chat/ChannelPicker';
import Chat from '../components/community/chat/Chat';
import ChatText from '../components/community/chat/ChatText';
import NameCard from '../components/community/chat/NameCard';
import { activeChatTab } from '../components/community/chat/state';
import LinkMenu from '../components/community/LinkMenu';
import { showChat } from '../components/community/state';
import ConfirmMenu from '../components/ConfirmMenu';
import DirectLinkPanel from '../components/direct/DirectLinkPanel';
import { directLink } from '../components/direct/directState';
import DockPanel from '../components/dock/DockPanel';
import DockPill from '../components/dock/DockPill';
import PlayDock from '../components/dock/PlayDock';
import GeneticChoice from '../components/genetic-choice/GeneticChoice';
import GeneticsView from '../components/genetics/GeneticsView';
import ShownMedals from '../components/medals/ShownMedals';
import Message from '../components/Message';
import ModSelect from '../components/mods/ModSelect';
import MatchScoreboard from '../components/multiplayer/MatchScoreboard';
import PlaylistOverlay from '../components/PlaylistOverlay';
import SkillProgression from '../components/result/SkillProgression';
import SkillsView from '../components/skills/SkillsView';
import SkillXPBar from '../components/SkillXPBar';
import ModeSelect from '../components/songselect/ModeSelect';
import XpMultiplierToggle from '../components/songselect/XpMultiplierToggle';
import UpgradeRow from '../components/upgrades/UpgradeRow';
import UpgradesView from '../components/upgrades/UpgradesView';
import { Playlist } from '../db/schema/playlist';
import {
	GROUP_OPTION,
	SETTINGS,
} from '../db/settings';
import Entities from '../entity/entities';
import { selectedMods } from '../gameplay/playMods';
import PlayQueue from '../gameplay/playQueue';
import {
	liveSpeedUpgrades,
	selectedRate,
} from '../gameplay/playRate';
import {
	geneticChoice,
	isCommunityOpen,
	isOptionsOpen,
	openPage,
} from '../globals';
import {
	log,
	logLines,
	logPlayFinished,
	LOGS_CHANNEL,
} from '../logs';
import Auth from '../online/auth';
import {
	closeMedals,
	showMedals,
	shownMedals,
} from '../online/medalWatch';
import Multiplayer from '../online/multiplayer';
import PlayManager from '../online/playManager';
import { keepPlaying } from '../online/queuePrefs';
import Socket from '../online/socket';
import BeatmapAPI from '../osu/beatmap/beatmap_api';
import LightBeatmap from '../osu/beatmap/LightBeatmap';
import LightBeatmapSet from '../osu/beatmap/LightBeatmapSet';
import { selectedRuleset } from '../rulesets/registry';
import Lobby from '../scenes/Lobby';
import MatchSetup from '../scenes/MatchSetup';
import Options from '../scenes/Options';
import Result from '../scenes/Result';
import SceneManager, { SCENE } from '../scenes/SceneManager';
import Skins from '../scenes/Skins';
import SongSelect from '../scenes/SongSelect';
import {
	sampleInstalledAddons,
	sampleRepoAddon,
} from './addonSamples';
import BigNumbersChips from './BigNumbersChips';
import MedalCatalogue from './MedalCatalogue';
import {
	MEDALS_BACKFILL,
	MEDALS_FIVE,
	MEDALS_ONE,
	MEDALS_THREE,
} from './medalSamples';
import PlayHudPreview from './PlayHudPreview';
import {
	FIRST_ROSTER,
	REBORN_ROSTER,
} from './rosterSample';
import SkinPlayground from './SkinPlayground';
import TimingPointPreview from './TimingPointPreview';
import {
	bigNumbersCharacter,
	convertingCharacter,
	REBORN_GENETICS,
	SAMPLE_GENETICS_7K,
	sampleCharacter,
	sampleGeneticCharacter,
} from './upgradeSample';
import UpgradesPreview from './UpgradesPreview';
import WarmupGaugePreview from './WarmupGaugePreview';

const gain = (
	skill: string,
	fromLevel: number,
	toLevel: number,
	gained: number,
	toFill = 0,
): SkillProgress => ({
	skill,
	gained,
	fromLevel,
	fromXp: 0,
	toLevel,
	toXp: toFill * Skill.xpForLevel(toLevel),
	levels: toLevel - fromLevel,
} as SkillProgress);

const spread = (count: number, levels: number): SkillProgress[] =>
	['accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release', 'reading',
		'consistency', 'concentration', 'speedjam', 'memory']
		.slice(0, count)
		.map((s, i) => gain(s, 0, Math.max(1, levels - i * 2), 1000 * (count - i)));

const BIG_SKILLS = [
	'accuracy', 'speed', 'stamina', 'jackspeed', 'coordination', 'release', 'reading',
];
const BIG_GAINS = [812, 14_230, 420_000, 2_810_000, 95_000_000, 4_200_000_000, 1.3e12]
	.map((xp, i) => gain(BIG_SKILLS[i], 0, 3 + i * 4, xp));

/** A queue of maps that were never downloaded - enough for the dock and the
 *  rail to render, which is all these cases need. */
const fakeQueue = (groupKey?: string) => {
	const entry = (artist: string, title: string, version: string, id: number) => ({
		metadata: {
			id, version, runtime: true, total_length: 180_000,
		},
		set: {
			metadata: {
				artist, title, 
			}, 
		},
		getBackgroundUri: async () => undefined,
		is: (other?: LightBeatmap) => other?.metadata.id === id,
	} as unknown as LightBeatmap);

	const entries = [
		entry('Juggernaut.', 'Godslain', 'sacrilegious conviction', 1),
		entry('Nekomata Master', 'Far east nightbird', 'Lunatic', 2),
		entry('xi', 'Blue Zenith', 'FOUR DIMENSIONS', 3),
		entry('Yooh', 'Fly Away', 'Insane', 4),
		entry('Various Artists', 'Jack Dumps', 'dj TAKA feat. NORIA - quaver', 5),
	];
	PlayQueue.start({
		label: 'Favourites', mode: 'PLAYLIST', groupKey,
	}, entries.map((beatmap, i) => ({
		beatmap, repeat: i === 2 ? 10 : undefined,
	})), 0);
	void PlayManager.live.set({
		token: 'playground',
		beatmap: entries[0],
		rate: 1,
		mods: [],
		startedAt: Date.now() - 70_000,
		endsAt: Date.now() + 110_000,
		accuracy: 0.9842,
		grade: 'S',
	});
	return entries;
};

/** {@link fakeQueue} for a signed-in player, supporter or not, keep playing on or off. */
const awayAs = (supporter: boolean, keep: boolean) => {
	void Auth.user.set({
		id: 1,
		username: 'Adri',
		avatarUrl: null,
		country: 'FR',
		createdAt: '2025-01-01',
		supporter,
		restricted: false,
		groups: [],
		nominates: [],
	});
	void keepPlaying.set(keep);
	void PlayManager.paused.set(false);
	fakeQueue();
};

/** {@link fakeQueue} from a playlist that gained a map once queued. */
const editedPlaylistQueue = async () => {
	const name = 'Playground: edited playlist';
	await (await Playlist.byName(name))?.deleteWithEntries();
	const playlist = await Playlist.create(name);
	for (const id of [1, 2, 3, 4, 5]) await playlist.addBeatmap(id);
	fakeQueue(`p${playlist.id}`);
	await PlayQueue.playlistChanged();
	await playlist.addBeatmap(6);
};

/** NF HR at x1.2 picked, with the speed to play it. */
const pickLock = () => {
	void selectedMods.set(['NF', 'HR']);
	void selectedRate.set(1.2);
	void liveSpeedUpgrades.set(10);
};

let locking: Promise<void> | undefined;

/** A playlist holding `beatmapId` unlocked, at x1.2 and at x1.2 +NFHR. Once a load:
 *  the stage sets a case up twice. */
const lockedPlaylist = (beatmapId: number) => locking ??= (async () => {
	const name = 'Playground: locked mods';
	await (await Playlist.byName(name))?.deleteWithEntries();
	const playlist = await Playlist.create(name);
	await playlist.addBeatmap(beatmapId);
	await playlist.addBeatmap(beatmapId, 1.2);
	await playlist.addBeatmap(beatmapId, 1.2, ['NF', 'HR']);
})();

/** {@link lockedPlaylist} on the first map of the picked ruleset the server lists. */
const lockedSongSelect = async () => {
	const manifest = await BeatmapAPI.getManifest();
	const beatmap = manifest.beatmaps
		.flatMap(m => LightBeatmapSet.fromMetadata(m).beatmaps)
		.find(b => b.inPickedRuleset());
	if (beatmap) await lockedPlaylist(beatmap.metadata.id);
};

const sampleScore = (): ScoreDTO => ({
	id: 1,
	unranked: false,
	characterId: resultPlayer(),
	beatmapId: 1,
	score: 912_345,
	accuracy: 0.9734,
	maxCombo: 412,
	judgements: Object.fromEntries(Judgements.map(j => [j, 0])) as JudgementCounts,
	grade: 'A',
	pp: 123,
	ur: 90,
	pfc: false,
	playedAt: Date.now(),
	rate: 1,
	mods: ['HR'],
});

/** A made-up replay: steady hits with a rough patch mid-song that drains HP low. */
const sampleReplay = (): ManiaGame => {
	const windows = maniaWindows(8);
	const score = new ScoreState(8, 8);
	const songEndMs = 180_000;
	const hits: HitRecord[] = [];
	for (let i = 0; i < 900; i++) {
		const time = 2_000 + i * 195;
		const rough = time > 70_000 && time < 95_000;
		const offset = Math.sin(i * 12.9898) * (rough ? 160 : 35);
		const judgement = judge(Math.abs(offset), windows);
		score.add(judgement);
		hits.push({
			time, offset: judgement === JUDGEMENT.MISS ? null : offset, judgement, hp: score.hp,
		});
	}
	return {
		hits, windows, songEndMs,
	} as unknown as ManiaGame;
};

type PlaygroundCase = {
	id: string,
	label: string,
	/** app state the case needs, applied before it renders - setting a Synced
	 *  from render updates whoever is subscribed to it mid-render, which React
	 *  refuses */
	setup?: () => void,
	render: () => ReactNode,
};

/** An accuracy skill deep enough to show a gear tier and its overdrive. Its
 *  Synceds are its own, so seeding them in render reaches nobody else. */
const tieredSkill = () => {
	const skill = makeOrderedSkills().find(s => s.name === 'accuracy')!;
	void skill.level.set(101);
	void skill.xp.set(Skill.xpForLevel(101) * 0.35);   // decimals visible
	void skill.upgrades.set(10);
	void skill.overdrive.set(4.2);
	void skill.prestige.set(1);
	return skill;
};

const showSample = (medals: () => MedalUnlock[]) => {
	const ids = medals().map(m => m.id);
	showMedals({
		ids, held: (shownMedals.get()?.held ?? 0) + ids.length,
	});
};

/** The whole unlock overlay over an empty stage; `more` lands while it is open. */
const medalCase = (
	id: string,
	label: string,
	medals: () => MedalUnlock[],
	more?: () => MedalUnlock[],
): PlaygroundCase => ({
	id,
	label,
	setup: () => {
		closeMedals();
		showSample(medals);
		if (more) setTimeout(() => showSample(more), 4000);
	},
	render: () => <ShownMedals />,
});

/** A host alone in an 8-player room, the way a new match starts. */
const fakeMatch = (): Match => {
	const me = Entities.character.get().id;
	return {
		id: 1,
		name: `${Entities.character.get().name}'s game`,
		locked: false,
		hostId: me,
		changingBeatmap: false,
		playing: false,
		slots: Array.from({ length: 16 }, (_, i) => i === 0
			? {
				state: 'player', characterId: me, ready: false, noMap: false, playing: false,
			}
			: { state: i < 8 ? 'open' : 'locked' }),
	};
};

/** A round under way: me and two others, standings climbing every second the
 *  way the server feeds them. */
const roundOf = (me: number): Match => {
	const match = fakeMatch();
	match.playing = true;
	match.beatmap = {
		id: 1, setId: 1, artist: 'Artist', title: 'Title', version: 'Hard', creator: 'Mapper', sr: 3.2,
	};
	[me, -2, -3].forEach((characterId, i) => match.slots[i] = {
		state: 'player', characterId, ready: false, noMap: false, playing: true,
	});
	return match;
};

// the character id is a placeholder until the account resolves, so the seat
// follows it each tick
const liveRound = () => {
	let second = 0;
	let rival = 0;
	setInterval(() => {
		second++;
		// the rival speeds up and slows down, so places swap now and then
		rival += second % 6 < 3 ? 14_000 : 6_000;
		const me = Entities.character.get().id;
		if (!Multiplayer.current.get()?.slots.some(s => s.state === 'player' && s.characterId === me)) {
			void Multiplayer.current.set(roundOf(me));
		}
		void Multiplayer.scores.set([
			{
				characterId: me, score: second * 9_870, combo: second * 4, failed: false,
			},
			{
				characterId: -2, score: rival, combo: second * 3, failed: false,
			},
			{
				characterId: -3, score: second * 4_020, combo: second, failed: false,
			},
		]);
	}, 1000);
};

/** Whose result the match result case shows: before the account resolves the
 *  character is a placeholder (0), which the result screen would ask the server
 *  for - a local id it reads locally. */
const resultPlayer = () => Entities.character.get().id || -1;

/** The chat card case's players: id (2 not a friend, 3 a friend, 4 mutual), colour, status. */
const NAME_CARD_SAMPLES = [
	[2, 'pink', 'playing'], [3, '#6cf', 'idle'], [4, '#fc6', 'afk'],
] as const;

/** Each case renders one component in isolation, with the inputs that are
 *  awkward to reach by playing the game. */
export const PLAYGROUND_CASES: PlaygroundCase[] = [
	{
		id: 'chat-name-cards',
		label: 'Chat - a sender\'s card: not a friend, friend, mutual',
		render: () => <div style={{
			display: 'flex', gap: 12, padding: 24, 
		}}>
			{NAME_CARD_SAMPLES.map(([id, color, status]) => (
				<div key={id} className="name-card" style={{
					position: 'static', borderColor: color, 
				}}>
					<NameCard color={color} friendship={{
						friend: id > 2, mutual: id === 4,
					}} p={{
						characterId: id, userId: id, name: `Player ${id}`, avatarUrl: '/icon-192.png', country: 'FR',
						rank: id * 7, rankPercent: id / 100, pp: 9000 - id * 400, accuracy: 0.97, level: 101,
						playCount: 1000, status, nowPlaying: status === 'playing' ? 'Camellia - GHOST' : undefined,
					} as PresenceEntry} />
				</div>
			))}
		</div>,
	},
	{
		id: 'skin-play',
		label: 'Skin - a generated chart',
		render: () => <SkinPlayground />,
	},
	{
		id: 'skins-manage',
		label: 'Skins - installed and own',
		render: () => <Skins view='manage' />,
	},
	{
		id: 'addons-installed',
		label: 'Add-ons - installed rows, each toggle state',
		render: () => <div className='page__list'>
			{sampleInstalledAddons().map((a, i) => <InstalledAddonRow
				key={a.id}
				addon={a}
				busy={false}
				hasUpdate={i === 1}
				onToggle={() => {}}
				onAutoUpdate={() => {}}
				onDetails={() => {}}
				onUpdate={() => {}}
				onUninstall={() => {}}
			/>)}
		</div>,
	},
	{
		id: 'options',
		label: 'Options - the whole panel, open',
		setup: () => void isOptionsOpen.set(true),
		render: () => <Options />,
	},
	{
		id: 'skins-browse',
		label: 'Skins - the catalog',
		render: () => <Skins view='browse' />,
	},
	{
		id: 'xpbar-single',
		label: 'XP bar - one level',
		render: () => <SkillXPBar progress={gain('accuracy', 3, 4, 420)} />,
	},
	{
		id: 'xpbar-many',
		label: 'XP bar - 81 levels',
		render: () => <SkillXPBar progress={gain('accuracy', 0, 81, 298_000)} budgetMs={4000} />,
	},
	{
		id: 'xpbar-past-100',
		label: 'XP bar - 98 to 104, coloured decimals',
		render: () => <SkillXPBar progress={gain('accuracy', 98, 104, 90_000_000, 0.45)} />,
	},
	{
		id: 'big-xp',
		label: 'Big numbers - XP gains from hundreds to trillions',
		render: () => <SkillProgression progression={BIG_GAINS} gains={BIG_GAINS} />,
	},
	{
		id: 'big-chips',
		label: 'Big numbers - song select XP chips',
		render: () => <BigNumbersChips />,
	},
	{
		id: 'big-upgrades',
		label: 'Big numbers - overdrive from σ4 to millions',
		render: () => <UpgradesPreview><UpgradesView character={bigNumbersCharacter()} /></UpgradesPreview>,
	},
	{
		id: 'big-genetics',
		label: 'Big numbers - a large climaxx balance',
		render: () => <UpgradesPreview tab="genetics">
			<GeneticsView character={bigNumbersCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'big-prestige',
		label: 'Big numbers - prestige with large overdrive',
		render: () => <UpgradesPreview tab="prestige">
			<PrestigeView character={bigNumbersCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'progression-one',
		label: 'Progression - 1 skill',
		render: () => <SkillProgression progression={spread(1, 2)} gains={spread(1, 2)} />,
	},
	{
		id: 'progression-full',
		label: 'Progression - 10 skills, deep',
		render: () => <SkillProgression progression={spread(10, 60)} gains={spread(10, 60)} />,
	},
	{
		id: 'upgrade-tier',
		label: 'Upgrade row - Lv101 with overdrive, buying a gear tier',
		render: () => <UpgradeRow skill={tieredSkill()} locked={false} />,
	},
	{
		id: 'skills',
		label: 'Skills - every skill state',
		render: () => <UpgradesPreview tab="skills">
			<SkillsView character={sampleCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'skills-genetics',
		label: 'Skills - with genetics',
		render: () => <UpgradesPreview tab="skills">
			<SkillsView character={sampleGeneticCharacter(REBORN_GENETICS, 2)} />
		</UpgradesPreview>,
	},
	{
		id: 'upgrades',
		label: 'Upgrades - every row state',
		render: () => <UpgradesPreview><UpgradesView character={sampleCharacter()} /></UpgradesPreview>,
	},
	{
		id: 'upgrades-genetics',
		label: 'Upgrades - with overdrive genes',
		render: () => <UpgradesPreview>
			<UpgradesView character={sampleGeneticCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'prestige',
		label: 'Prestige - every row state',
		render: () => <UpgradesPreview tab="prestige">
			<PrestigeView character={sampleCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'genetics',
		label: 'Genetics - a speed genetic with genes held',
		render: () => <UpgradesPreview tab="genetics">
			<GeneticsView character={sampleGeneticCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'genetics-overdrive',
		label: 'Genetics - speed overdrive to turn into climaxx',
		render: () => {
			const character = convertingCharacter(1.5);
			return <UpgradesPreview tab="genetics">
				<GeneticsView character={character} />
			</UpgradesPreview>;
		},
	},
	{
		id: 'genetics-overdrive-short',
		label: 'Genetics - too little speed overdrive for the next tier',
		render: () => {
			const character = convertingCharacter(0.4);
			return <UpgradesPreview tab="genetics">
				<GeneticsView character={character} />
			</UpgradesPreview>;
		},
	},
	{
		id: 'genetics-7k',
		label: 'Genetics - 7K, a speed genetic with genes held',
		setup: () => void selectedRuleset.set('mania7k'),
		render: () => <UpgradesPreview tab="genetics">
			<GeneticsView character={sampleGeneticCharacter(SAMPLE_GENETICS_7K)} />
		</UpgradesPreview>,
	},
	{
		id: 'genetic-choice-7k',
		label: 'Character creation - 7K\'s ring',
		setup: () => {
			void selectedRuleset.set('mania7k');
			Entities.character.set(sampleCharacter());
			void geneticChoice.set('first');
		},
		render: () => <GeneticChoice />,
	},
	{
		id: 'genetics-reborn',
		label: 'Genetics - reborn once, two genetics side by side',
		render: () => <UpgradesPreview tab="genetics">
			<GeneticsView character={sampleGeneticCharacter(REBORN_GENETICS, 2)} />
		</UpgradesPreview>,
	},
	{
		id: 'prestige-climaxx',
		label: 'Prestige - overdrive becoming climaxx',
		render: () => (
			<PrestigeClimaxxPop skill="accuracy" overdrive={5000} before={300} gain={498} onClose={() => {}} />
		),
	},
	{
		id: 'genetics-climaxx',
		label: 'Genetics - part of the overdrive becoming climaxx',
		render: () => (
			<PrestigeClimaxxPop
				skill="speed" overdrive={12.4} kept={30.1} before={60} gain={48} onClose={() => {}}
			/>
		),
	},
	{
		id: 'genetics-empty',
		label: 'Genetics - no genetic picked yet',
		render: () => <UpgradesPreview tab="genetics">
			<GeneticsView character={sampleCharacter()} />
		</UpgradesPreview>,
	},
	{
		id: 'genetic-choice',
		label: 'Character creation - the ring, the quiz a click away',
		setup: () => {
			Entities.character.set(sampleCharacter());
			void geneticChoice.set('first');
		},
		render: () => <GeneticChoice />,
	},
	{
		id: 'genetic-choice-another',
		label: 'Character creation - reborn, the second genetic',
		setup: () => {
			Entities.character.set(sampleGeneticCharacter({
				...REBORN_GENETICS, picks: [{ skill: 'speed' }], 
			}, 2));
			void geneticChoice.set('change');
		},
		render: () => <GeneticChoice />,
	},
	{
		id: 'genetic-choice-replace',
		label: 'Character creation - reborn twice, three genetics, choosing one to replace',
		setup: () => {
			Entities.character.set(sampleGeneticCharacter({
				...REBORN_GENETICS,
				picks: [{ skill: 'speed' }, {
					skill: 'stamina', changedAt: Date.now() - 86_400_000, 
				}, { skill: 'coordination' }],
			}, 3));
			void geneticChoice.set('change');
		},
		render: () => <GeneticChoice />,
	},
	{
		id: 'confirm-rebirth',
		label: 'Confirm - long rebirth text',
		render: () => <ConfirmMenu
			title="Rebirth as Adri?"
			sub={'Adri becomes Adri_old, stays playable and ranked · '
				+ 'The new character starts from zero and unlocks: DIVINE'}
			confirmLabel="Rebirth"
			color="#ff4089"
			onConfirm={() => {}}
			onClose={() => {}}
		/>,
	},
	{
		id: 'chat-links',
		label: 'Chat - web addresses in messages, click one for its menu',
		render: () => <div className="chat__log">
			{[
				'check https://osu.ppy.sh/beatmapsets/1#osu/2 out',
				'(wiki: https://en.wikipedia.org/wiki/Osu!_(game)).',
				'www.example.com, node.js and foo@bar.com',
				'https://раураl.com/login',
				'[https://site/web/maps/1?diff=2 Camellia - Exit This Earth\'s Atomosphere [Evolution]]',
			].map(text => <div key={text} className="chat__line"><ChatText text={text} /></div>)}
			<LinkMenu />
		</div>,
	},
	{
		id: 'chat-emoji',
		label: 'Chat - emoji as images: :names:, typed characters, unknown names stay text, '
			+ 'a supporter\'s own only in their lines',
		render: () => <div className="chat__log">
			{([
				['gg :sob: :thumbsup: :heart:'],
				['typed as is 😭👍❤ ❤️ (and 🫠, not an emoji here)'],
				[':oss: and :no_such_emoji: and :star_struck::fire:'],
				[':sob: https://osu.ppy.sh/beatmapsets/1 :tada:'],
				// a supporter's own (account 500711's on the emoji branch's test data)
				['its owner sends :jokey:', 500711],
				['someone else sends :jokey:', 45444],
			] as const).map(([text, senderId]) => <div key={text} className="chat__line">
				<ChatText text={text} senderId={senderId} />
			</div>)}
		</div>,
	},
	{
		id: 'direct-link',
		label: 'oss!direct - the panel a supporter gets from a map link in chat',
		setup: () => void BeatmapAPI.getManifest().then(m => directLink.set(m.beatmaps[1]?.id)),
		render: () => <DirectLinkPanel />,
	},
	{
		id: 'chat-tabs',
		label: 'Chat - tabs: #logs has a new line (light), the rest are read (dark); '
			+ 'hover one for its close, + opens the channel list',
		setup: () => {
			log('A new line in #logs');
			// open as in the game: Ctrl+Tab only steps the tabs of a chat on screen
			void isCommunityOpen.set(true);
			void showChat.set(true);
		},
		render: () => <div style={{ height: 300 }}><Chat /><ChannelPicker /></div>,
	},
	{
		id: 'chat-logs',
		label: '#logs - plays at a rate with mods and pp, at x1 with none, a loved map without pp, level-ups',
		setup: () => {
			void activeChatTab.set(LOGS_CHANNEL);
			// the playground can run a case's setup twice
			if (logLines.get().length > 1) return;
			const [godslain, nightbird, zenith] = fakeQueue();
			const play = (grade: Grade, accuracy: number, rate: number, mods: Mod[], pp: number) => ({
				grade, accuracy, rate, mods, pp, playedAt: Date.now(),
			});
			logPlayFinished(play('S', 0.9696, 0.85, ['HR'], 234.4), godslain, [
				gain('speedjam', 101, 101, 92_926), gain('concentration', 87, 88, 101), gain('release', 64, 64, 3),
			]);
			logPlayFinished(play('SS', 1, 1, [], 412.8), nightbird, [gain('accuracy', 99, 99, 5_412_000)]);
			logPlayFinished(play('A', 0.9312, 1.2, [], 0), zenith, []);
		},
		render: () => <div style={{ height: 300 }}><Chat /></div>,
	},
	{
		id: 'chat-announce',
		label: '#announce - a 4K #1, a perfect 7K #1, a 4K pp milestone, an admin line without a ruleset',
		setup: () => {
			const line = (text: string, color: string, ruleset?: RulesetId): ChatLine => ({
				id: text, kind: 'system', channel: ANNOUNCE_CHANNEL, text, color, at: Date.now(),
				...ruleset && { ruleset },
			});
			void Socket.chat.set([
				line('Sky3rr achieved rank #1 on BEMANI Sound Team - TWO-TORIAL [4K EXH]', '#fa81c6', 'mania4k'),
				line('Adri achieved a perfect rank #1 on Camellia - Ghost [7K Another]', '#c794ff', 'mania7k'),
				line('PatouZ has reached 9,000pp !', '#fa9981', 'mania4k'),
				line('Server restart in 5 minutes', '#ffcc22'),
			]);
			void activeChatTab.set(ANNOUNCE_CHANNEL);
		},
		render: () => <div style={{ height: 300 }}><Chat /></div>,
	},
	{
		id: 'away-chip',
		label: 'Away time - beside the queue length, hovered',
		setup: () => awayAs(false, true),
		render: () => <DockPanel />,
	},
	{
		id: 'away-chip-supporter',
		label: 'Away time - supporter, hovered',
		setup: () => awayAs(true, true),
		render: () => <DockPanel />,
	},
	{
		id: 'away-chip-off',
		label: 'Away time - keep playing off, hovered',
		setup: () => awayAs(false, false),
		render: () => <DockPanel />,
	},
	{
		id: 'characters-reborn',
		label: 'Characters - reborn in 4K, the old character still on 7K',
		setup: () => awayAs(false, true),
		render: () => <UpgradesPreview tab="characters">
			<CharactersTable characters={REBORN_ROSTER} shown={{
				id: 2, ruleset: 'mania4k', 
			}} />
		</UpgradesPreview>,
	},
	{
		id: 'characters-first',
		label: 'Characters - one character, 7K paused, keep playing off',
		setup: () => awayAs(false, false),
		render: () => <UpgradesPreview tab="characters">
			<CharactersTable characters={FIRST_ROSTER} shown={{
				id: 2, ruleset: 'mania4k', 
			}} />
		</UpgradesPreview>,
	},
	{
		id: 'dock-panel',
		label: 'Play dock - open, mid-play with a queue behind it',
		setup: () => fakeQueue(),
		render: () => <DockPanel />,
	},
	{
		id: 'dock-refresh',
		label: 'Play dock - the queue\'s playlist was edited since: its refresh beside the playlist',
		setup: () => void editedPlaylistQueue(),
		render: () => <DockPanel />,
	},
	{
		id: 'dock-refresh-queue',
		label: 'Play dock - docked beside the queue view, its playlist edited since',
		setup: () => void editedPlaylistQueue(),
		render: () => <DockPanel left />,
	},
	{
		id: 'dock-pill',
		label: 'Play dock - collapsed, as it sits over gameplay',
		setup: () => fakeQueue(),
		render: () => <DockPill />,
	},
	{
		id: 'dock-sparse',
		label: 'Play dock - nothing playing, nothing queued',
		setup: () => {
			PlayQueue.stop();
			void PlayManager.live.set(undefined);
			void SceneManager.current.set(SCENE.SELECT);
			void openPage.set(undefined);
		},
		render: () => <PlayDock />,
	},
	{
		id: 'songselect',
		label: 'Song select - widescreen shows the logo play button bottom right',
		setup: () => void SceneManager.current.set(SCENE.SELECT),
		render: () => <SongSelect />,
	},
	{
		id: 'mode-select',
		label: 'Song select - the Mode menu, as it opens over the Mode button at 1920x1080',
		setup: () => void SceneManager.current.set(SCENE.SELECT),
		render: () => (<>
			<SongSelect />
			<ModeSelect anchor={new DOMRect(200, 970, 105, 110)} onClose={() => {}} />
		</>),
	},
	{
		id: 'mode-select-reborn',
		label: 'Song select - the Mode menu for a reborn character, held to 4K: click 7K for why',
		setup: () => {
			void SceneManager.current.set(SCENE.SELECT);
			Entities.character.set(sampleGeneticCharacter(REBORN_GENETICS, 2));
		},
		render: () => (<>
			<SongSelect />
			<ModeSelect anchor={new DOMRect(200, 970, 105, 110)} onClose={() => {}} />
			<Message />
		</>),
	},
	{
		id: 'songselect-queue',
		label: 'Queue carousel - as it sits over a play, with the dock',
		// the real composition: the carousel is a page over the gameplay scene,
		// and the dock fills the column it leaves
		setup: () => {
			fakeQueue();
			void SceneManager.current.set(SCENE.GAME);
			void openPage.set({ page: 'queue' });
		},
		render: () => (<>
			<SongSelect mode="queue" />
			<PlayDock />
		</>),
	},
	{
		id: 'play-hud',
		label: 'Gameplay HUD - strain sparklines, warm-up bar, solo leaderboard (?at=<ms>: mid-play)',
		render: () => <PlayHudPreview />,
	},
	{
		id: 'warmup-gauge',
		label: 'Gameplay HUD - warm-up bar: cold, warming up, peak, pushing, fatigued',
		render: () => <WarmupGaugePreview />,
	},
	{
		id: 'xp-toggle',
		label: 'Debug XP multiplier',
		render: () => <XpMultiplierToggle />,
	},
	{
		id: 'medals-catalogue',
		label: 'Medals - every one',
		render: () => <MedalCatalogue />,
	},
	medalCase('medals-one', 'Medal unlock - one', MEDALS_ONE),
	medalCase('medals-three', 'Medal unlock - three, one secret', MEDALS_THREE),
	medalCase('medals-five', 'Medal unlock - five', MEDALS_FIVE),
	medalCase('medals-backfill', 'Medal unlock - backfill', MEDALS_BACKFILL),
	medalCase('medals-more', 'Medal unlock - five more while open', MEDALS_THREE, MEDALS_FIVE),
	{
		id: 'mp-lobby',
		label: 'Multiplayer lobby - one open room',
		setup: () => {
			void Multiplayer.matches.set([fakeMatch()]);
		},
		render: () => <Lobby />,
	},
	{
		id: 'mp-result',
		label: 'Multiplayer result - three players, round over',
		setup: () => {
			const me = resultPlayer();
			void Multiplayer.current.set({
				...fakeMatch(),
				lastRound: {
					beatmapId: 1, startedAt: 0, results: [
						{
							characterId: me, score: 912_345, combo: 412, failed: false,
						},
						{
							characterId: -2, score: 640_120, combo: 233, failed: false,
						},
						{
							characterId: -3, score: 210_004, combo: 58, failed: true,
						},
					],
				},
			});
		},
		render: () => <Result score={sampleScore()} progression={spread(4, 12)} />,
	},
	{
		id: 'result-solo',
		label: 'Result - solo play, with retry',
		render: () => <Result score={sampleScore()} progression={spread(4, 12)} beatmap={fakeQueue()[0]} />,
	},
	{
		id: 'result-mods',
		label: 'Result - mods and a rate',
		render: () => <Result
			score={{
				...sampleScore(), mods: ['HR', 'SD'], rate: 1.25, 
			}}
			progression={spread(4, 12)}
			beatmap={fakeQueue()[0]}
		/>,
	},
	{
		id: 'playlist-lock',
		label: 'Playlist manager - locked at x1.2 and x1.2 +NFHR, NF HR at x1.2 picked',
		setup: () => {
			pickLock();
			void lockedPlaylist(1);
		},
		render: () => <PlaylistOverlay beatmap={fakeQueue()[0]} onClose={() => {}} />,
	},
	{
		id: 'songselect-playlist-lock',
		label: 'Song select - By Playlist, a map unlocked, at x1.2 and at x1.2 +NFHR',
		setup: () => {
			pickLock();
			void SETTINGS.groupby.set(GROUP_OPTION['By Playlist']);
			void SceneManager.current.set(SCENE.SELECT);
			void lockedSongSelect();
		},
		render: () => <SongSelect />,
	},
	{
		id: 'mod-select',
		label: 'Mod select - HR SD at x1.25',
		setup: () => {
			void selectedMods.set(['HR', 'SD']);
			void selectedRate.set(1.25);
		},
		render: () => <ModSelect onClose={() => {}} />,
	},
	{
		id: 'mod-select-7k',
		label: 'Mod select - 7K, with the Right Thumb',
		setup: () => {
			void selectedRuleset.set('mania7k');
			void selectedMods.set(['RT']);
			void selectedRate.set(1);
		},
		render: () => <ModSelect onClose={() => {}} />,
	},
	{
		id: 'result-replay',
		label: 'Result - with replay graphs',
		render: () => <Result
			score={sampleScore()}
			game={sampleReplay()}
			progression={spread(4, 12)}
			beatmap={fakeQueue()[0]}
		/>,
	},
	{
		id: 'result-replay-divine',
		label: 'Result - replay graphs, with the divine row',
		render: () => <Result
			score={{
				...sampleScore(),
				judgements: {
					...sampleScore().judgements, DIVINE: 120, MARVELOUS: 260, PERFECT: 24, MISS: 8,
				},
			}}
			game={sampleReplay()}
			progression={spread(4, 12)}
			beatmap={fakeQueue()[0]}
		/>,
	},
	{
		id: 'mp-abort-confirm',
		label: 'Multiplayer - abort the running play first',
		render: () => <ConfirmMenu
			title="A play is running"
			sub="Abort it to play multiplayer?"
			confirmLabel="Abort"
			onConfirm={() => {}}
			onClose={() => {}}
		/>,
	},
	{
		id: 'mp-scoreboard',
		label: 'Multiplayer live scoreboard - three players, scores climbing',
		setup: liveRound,
		render: () => <MatchScoreboard beatmapId={1} />,
	},
	{
		id: 'mp-slots',
		label: 'Multiplayer match setup - every seat state',
		setup: () => {
			const match = fakeMatch();
			type Flags = Partial<Record<'ready' | 'noMap' | 'playing', boolean>>;
			const seat = (characterId: number, state: Flags) => ({
				state: 'player' as const, characterId, ready: false, noMap: false, playing: false, ...state,
			});
			match.slots[1] = seat(-2, { ready: true });
			match.slots[2] = seat(-3, { noMap: true });
			match.slots[3] = seat(-4, { playing: true });
			match.slots[4] = seat(-5, {});
			void Multiplayer.current.set(match);
		},
		render: () => <MatchSetup />,
	},
	{
		id: 'mp-match',
		label: 'Multiplayer match setup - host alone',
		setup: () => {
			void Multiplayer.current.set(fakeMatch());
		},
		render: () => <MatchSetup />,
	},
	{
		id: 'addon-repo-new',
		label: 'Add-on editor - a new add-on built from a repository',
		render: () => <AddonView
			mode='edit'
			detail={{
				...newAddonDetail(), kind: ADDON_KIND.repo,
			}}
			onBack={() => {}}
			onSaved={() => {}}
		/>,
	},
	{
		id: 'addon-inline-refused',
		label: 'Add-on editor - inline code that runs unreviewed code',
		render: () => <AddonView
			mode='edit'
			detail={{
				...newAddonDetail(),
				name: 'Sneaky',
				source: [
					'export const mount = async () => {',
					'\tconst code = await (await fetch(url)).text();',
					'\teval(code);',
					'\tawait import(url);',
					'};',
				].join('\n'),
			}}
			onBack={() => {}}
			onSaved={() => {}}
		/>,
	},
	{
		id: 'addon-repo-failed',
		label: 'Add-on editor - repository add-on, its last build failed',
		render: () => <AddonView
			mode='edit'
			detail={detailOfDTO(sampleRepoAddon())}
			addon={sampleRepoAddon()}
			onBack={() => {}}
			onSaved={() => {}}
		/>,
	},
	{
		id: 'addon-markdown',
		label: 'Add-on details - a Markdown description',
		render: () => <AddonView
			mode='view'
			detail={{
				...detailOfDTO(sampleRepoAddon()),
				description: '## What it does\nSimulates your character on **every** downloaded map'
					+ ' to rank *farm value*.\n\n- `sim` playlists\n- ~~manual~~ automatic\n\n'
					+ 'Source on [GitHub](https://github.com/oss-idle/addon-sim).',
			}}
			onBack={() => {}}
		/>,
	},
	{
		id: 'editor-timing-point',
		label: 'Editor - a BPM point, its time nudged by 1 ms (10 with Shift)',
		render: () => <TimingPointPreview />,
	},
];
