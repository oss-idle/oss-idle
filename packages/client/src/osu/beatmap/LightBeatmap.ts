import { Beatmap } from 'osu-classes';

import type { Mod } from '@oss-idle/shared/mods';
import {
	type RulesetId,
	rulesetOf,
} from '@oss-idle/shared/rulesets/ids';

import { music } from '../../audio/MusicPlayer';
import { playable } from '../../rulesets/enabled';
import { selectedRuleset } from '../../rulesets/registry';
import BeatmapAPI, { VersionMetadata } from './beatmap_api';
import BeatmapSet from './beatmap_set';
import BeatmapStore, { RuntimeVersionMetadata } from './beatmap_store';
import LightBeatmapSet from './LightBeatmapSet';

export default class LightBeatmap {

	constructor(
		public set: LightBeatmapSet,
		public metadata: RuntimeVersionMetadata | VersionMetadata,
		/** the rate a playlist locked it at: it plays there, whatever the mod */
		public lockedRate?: number,
		/** the mods locked with that rate: it plays with these, whatever is picked */
		public lockedMods?: Mod[],
	) {
	}

	/** Its playlist lock, '' when it follows the picked rate and mods. */
	public get lock(): string {
		return this.lockedRate === undefined ? '' : `${this.lockedRate}+${this.lockedMods?.join('') ?? ''}`;
	}

	/** This difficulty locked at a rate and mods, or following the picked ones without a rate. */
	public at(rate: number | undefined, mods: Mod[] = []): LightBeatmap {
		const at = new LightBeatmap(this.set, this.metadata, rate, rate === undefined ? undefined : mods);
		return at.lock === this.lock ? this : at;
	}

	/** Played by a ruleset this build plays: a match or the queue may hand any of them. */
	public isPlayable(): boolean {
		return playable(this.metadata.mode, this.metadata.keys);
	}

	/** The ruleset that plays it, when one does. */
	public ruleset(): RulesetId | undefined {
		return rulesetOf(this.metadata.mode, this.metadata.keys);
	}

	/** Played by the ruleset the player picked: what song select lists. */
	public inPickedRuleset(): boolean {
		return this.ruleset() === selectedRuleset.get();
	}

	public isPlaying(): boolean {
		return this.is(music.beatmap.get());
	}

	/** The same entry: by id alone for a number, and with the same lock for a
	 *  beatmap, since a playlist's locked copy is an entry of its own. */
	public is(beatmap?: LightBeatmap | number): boolean {
		if (typeof beatmap === 'number') return this.metadata.id === beatmap;
		return this.metadata.id === beatmap?.metadata.id && this.lock === beatmap.lock;
	}

	public async load(): Promise<Beatmap> {
		const beatmap = await new BeatmapSet(this.set.metadata.id).beatmap(this.metadata.id);
		if (!beatmap) throw new Error(`Loaded invalid beatmap ${this.metadata.id} from set ${this.set.metadata.id}`);
		return beatmap;
	}

	public async getBackgroundUri(): Promise<string | undefined> {
		return this.metadata.runtime ? 
			BeatmapStore.getBeatmapBackground(this) 
			: BeatmapAPI.assetUrl(this.metadata.background);
	}

	public async getAudioUri(): Promise<string | undefined> {
		return this.metadata.runtime ? 
			BeatmapStore.getBeatmapAudio(this) 
			: BeatmapAPI.assetUrl(this.metadata.audio);
	}

}