import { t } from '@lingui/core/macro';

import type { ClientMessage } from '@oss-idle/shared/community/wire';
import Log from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';
import { modsKey } from '@oss-idle/shared/mods';
import {
	isMatchChannel,
	LOBBY_CHANNEL,
	type Match,
	matchChannel,
	type PlayerSlot,
	type RoundScore,
} from '@oss-idle/shared/multiplayer';

import { music } from '../audio/MusicPlayer';
import {
	activeChatTab,
	chatTabs,
} from '../components/community/chat/state';
import Entities from '../entity/entities';
import { selectedMods } from '../gameplay/playMods';
import PlayQueue from '../gameplay/playQueue';
import { selectedRate } from '../gameplay/playRate';
import { beatmapsVersion } from '../osu/beatmap/beatmap_store';
import { launchPlay } from '../scenes/launchPlay';
import SceneManager, { SCENE } from '../scenes/SceneManager';
import { followMatchSounds } from './matchSounds';
import { restrictedMessage } from './play';
import PlayManager from './playManager';
import Socket from './socket';

type JoinReason = 'full' | 'password' | 'gone' | 'playing' | 'restricted';

/** Survives a dev hot reload: this module sits under SceneManager, which
 *  reloads it with every scene edit, and a fresh copy would forget the room. */
const persisted = (import.meta.hot?.data ?? {}) as {
	matches?: Synced<Match[]>,
	current?: Synced<Match | undefined>,
	scores?: Synced<RoundScore[]>,
	picking?: Synced<boolean>,
	started?: boolean,
};

/** The open matches (the lobby), and the one this character is seated in. */
export default class Multiplayer {

	public static readonly matches = (persisted.matches ??= new Synced<Match[]>([]));
	public static readonly current = (persisted.current ??= new Synced<Match | undefined>(undefined));
	/** The live scores of the round being watched (the in-game scoreboard). */
	public static readonly scores = (persisted.scores ??= new Synced<RoundScore[]>([]));
	/** The host is in song select picking the match's map. */
	public static readonly picking = (persisted.picking ??= new Synced(false));

	public static start(): void {
		if (persisted.started) return;
		persisted.started = true;

		// the server's list says where we are seated, whatever this client remembered
		Socket.on('mp:list', ({ matches }) => {
			void this.matches.set(matches);
			void this.current.set(matches.find(m => this.mySlot(m)));
		});
		Socket.on('mp:update', ({ match }) => {
			void this.matches.set([...this.matches.get().filter(m => m.id !== match.id), match]);
			if (this.mySlot(match)) void this.current.set(match);
			else if (this.current.get()?.id === match.id) void this.current.set(undefined);
		});
		Socket.on('mp:remove', ({ id }) => {
			void this.matches.set(this.matches.get().filter(m => m.id !== id));
			if (this.current.get()?.id === id) void this.current.set(undefined);
		});
		Socket.on('mp:scores', ({ scores }) => void this.scores.set(scores));
		Socket.on('mp:joined', ({ match }) => {
			if (match) void this.current.set(match);
		});
		// a reconnect re-reads the list, which also says whether we are still seated
		void Socket.connected.sync(open => { if (open) this.send({ type: 'mp:list' }); });

		this.followHost();
		followMatchSounds(this.current);
		this.followChannel();
		this.followRounds();
		void Synced.all([this.current, beatmapsVersion], () => void this.reportMap());
		void Synced.all([this.current, selectedRate], () => this.reportRate());
		void Synced.all([this.current, selectedMods], () => this.reportMods());
	}

	/** And with their own mods. */
	private static reportMods(): void {
		const match = this.current.get();
		const mine = match && this.mySlot(match);
		const mods = selectedMods.get();
		if (!mine || match.playing || modsKey(mine.mods ?? []) === modsKey(mods)) return;
		this.send({
			type: 'mp:mods', mods,
		});
	}

	/** Everyone plays at their own rate: the server starts our round play at ours. */
	private static reportRate(): void {
		const match = this.current.get();
		const mine = match && this.mySlot(match);
		const rate = selectedRate.get();
		if (!mine || match.playing || (mine.rate ?? 1) === rate) return;
		this.send({
			type: 'mp:rate', rate,
		});
	}

	/** Our play of the running round is over, others' maybe not. */
	public static waitingOnRound(): boolean {
		const match = this.current.get();
		return !!match?.playing && !!this.mySlot(match)?.playing;
	}

	/** Resolves once the running round is over (or we left the match). */
	public static roundOver(): Promise<void> {
		return new Promise(resolve => {
			const check = (match: Match | undefined) => {
				if (match?.playing) return;
				this.current.desync(check);
				resolve();
			};
			void this.current.sync(check);
		});
	}

	/** osu!'s notice when the host's crown passes to us. */
	private static followHost(): void {
		let host: number | undefined;
		void this.current.sync(match => {
			if (match && host !== undefined && match.hostId !== host && this.isHost(match)) {
				Log.popup(t`You have become the host for this room!`);
			}
			host = match?.hostId;
		});
	}

	/** #multiplayer is always the current room's channel: one tab, opened with
	 *  the room and closed when we leave it. */
	private static followChannel(): void {
		void this.current.sync(match => {
			const next = match && matchChannel(match.id);
			const open = chatTabs.get();
			if (next ? open[0] === next && open.filter(isMatchChannel).length === 1
				: !open.some(isMatchChannel)) return;
			const tabs = open.filter(t => !isMatchChannel(t));
			void chatTabs.set(next ? [next, ...tabs] : tabs);
			if (next) void activeChatTab.set(next);
			else if (isMatchChannel(activeChatTab.get() ?? '')) void activeChatTab.set(tabs[0]);
		});
	}

	private static followRounds(): void {
		let playing = false;
		void this.current.sync(match => {
			const mine = match && this.mySlot(match);
			if (mine?.playing && !playing) void this.enterRound(match!);
			playing = !!mine?.playing;
		});
	}

	public static mySlot(match: Match): PlayerSlot | undefined {
		const me = Entities.character.get()?.id;
		return match.slots.find((s): s is PlayerSlot => s.state === 'player' && s.characterId === me);
	}

	/** We are playing this map in the match's running round. */
	public static inRound(match: Match, beatmapId: number): boolean {
		return match.playing && match.beatmap?.id === beatmapId && !!this.mySlot(match)?.playing;
	}

	/** Our play of this map is the running round's. */
	public static playingRound(beatmapId: number): boolean {
		const match = this.current.get();
		return !!match && this.inRound(match, beatmapId);
	}

	public static isHost(match: Match): boolean {
		return match.hostId === Entities.character.get()?.id;
	}

	public static send(msg: ClientMessage): void {
		Socket.send(msg);
	}

	public static async create(
		name: string,
		password: string,
		size: number,
		isPublic: boolean,
	): Promise<JoinReason | undefined> {
		PlayQueue.stop();
		const { reason } = await Socket.request({
			type: 'mp:create', name, password, size, isPublic, beatmapId: music.beatmap.get()?.metadata.id,
		}, 'mp:joined');
		if (reason === 'playing') Log.popup(t`Abort your running play to join a game.`);
		if (reason === 'restricted') Log.errorPopup(restrictedMessage());
		return reason;
	}

	/** Join a match; resolves with why it was refused, if it was. */
	public static async join(id: number, password = ''): Promise<JoinReason | undefined> {
		PlayQueue.stop();
		const { reason } = await Socket.request({
			type: 'mp:join', id, password,
		}, 'mp:joined');
		if (reason === 'playing') Log.popup(t`Abort your running play to join a game.`);
		if (reason === 'restricted') Log.errorPopup(restrictedMessage());
		return reason;
	}

	public static leave(): void {
		this.send({ type: 'mp:leave' });
		void this.current.set(undefined);
	}

	public static pickBeatmap(): void {
		void this.picking.set(true);
		this.send({
			type: 'mp:changing', changing: true,
		});
		SceneManager.set(SCENE.SELECT);
	}

	/** Back from song select with a map, or none to keep the one it had. */
	public static picked(beatmapId?: number): void {
		void this.picking.set(false);
		if (beatmapId === undefined) this.send({
			type: 'mp:changing', changing: false,
		});
		else this.send({
			type: 'mp:beatmap', beatmapId,
		});
		SceneManager.set(SCENE.MATCH);
	}

	/** #lobby is for everyone on the Multi screen: joined on entering it. */
	public static joinLobbyChat(): void {
		if (!chatTabs.get().includes(LOBBY_CHANNEL)) void chatTabs.set([...chatTabs.get(), LOBBY_CHANNEL]);
		if (!this.current.get()) void activeChatTab.set(LOBBY_CHANNEL);
	}

	/** ...and left on going back to the menu. */
	public static leaveLobbyChat(): void {
		const tabs = chatTabs.get().filter(t => t !== LOBBY_CHANNEL);
		void chatTabs.set(tabs);
		if (activeChatTab.get() === LOBBY_CHANNEL) void activeChatTab.set(tabs[0]);
	}

	/** Where a play's end leads back to: the match, when in one. */
	public static afterPlay(): typeof SCENE.MATCH | typeof SCENE.SELECT {
		return this.current.get() ? SCENE.MATCH : SCENE.SELECT;
	}

	/** The host started: watch our play, as osu! puts everyone in game. */
	private static async enterRound(match: Match): Promise<void> {
		const scene = SceneManager.current.get();
		if (!match.beatmap || (scene !== SCENE.MATCH && scene !== SCENE.RESULT)) return;
		const beatmap = await PlayManager.findDownloaded(match.beatmap.id);
		if (beatmap) launchPlay(beatmap);
	}

	private static async reportMap(): Promise<void> {
		const match = this.current.get();
		const mine = match && this.mySlot(match);
		if (!match?.beatmap || !mine) return;
		const noMap = !await PlayManager.findDownloaded(match.beatmap.id);
		if (noMap !== mine.noMap) this.send({
			type: 'mp:noMap', noMap,
		});
	}

}
