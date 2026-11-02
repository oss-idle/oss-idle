import '@oss-idle/shared/osu/controlPointPatch';

import { Beatmap } from 'osu-classes';
import { BeatmapDecoder } from 'osu-parsers';

import BeatmapAPI from './beatmap_api';
import BeatmapStore, { SetRecord } from './beatmap_store';
import LightBeatmapSet from './LightBeatmapSet';

export default class BeatmapSet {

	private record?: SetRecord;
	
	constructor(
		public id: number,
	) {}

	private async getRecord(): Promise<SetRecord> {
		const existing = this.record
			??= await BeatmapStore.getSet(this.id);

		if (existing) return existing;
		
		const metadata = (await BeatmapAPI.getManifest())
			.beatmaps.find(m => m.id === this.id);

		if (!metadata) {
			throw new Error(`Tried to get set with invalid id ${this.id}`);
		}

		return BeatmapAPI.downloadOsz(metadata);				
	}

	/** One difficulty, parsed: a set's other difficulties are not read. */
	public async beatmap(id: number): Promise<Beatmap | undefined> {
		const text = (await this.getRecord()).osu[id];
		if (text === undefined) return undefined;
		const beatmap = new BeatmapDecoder().decodeFromString(text);
		// the catalog's ids, over whatever an older stored file says
		beatmap.metadata.beatmapId = id;
		beatmap.metadata.beatmapSetId = this.id;
		return beatmap;
	}

	public static async getIntro(): Promise<LightBeatmapSet> {
		const intro = (await BeatmapAPI.getManifest()).intro;
		if (!intro) throw new Error('Intro beatmap is not available');
		return LightBeatmapSet.fromMetadata(
			(await BeatmapAPI.downloadOsz(intro)).metadata,
		);
	}

}