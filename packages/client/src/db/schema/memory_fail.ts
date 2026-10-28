import {
	DAO,
	DB,
	integer,
	real,
	table,
} from '../dao';

const t = table('memory_fail', {
	id:          integer().primaryKey().autoincrement(),
	characterId: integer(),
	beatmapId:   integer(),
	playedAt:    integer(),
	/** how far into the map the play got, 0-1 */
	share:       real(),
}, { indexes: { idx_memory_fail_map: 'characterId, beatmapId' } });

let created: Promise<void> | undefined;

/** A failed local play: it trains memory by the share of the map it reached. */
export class MemoryFail extends DAO(t) {

	/** A table registered after the database opened is not created yet. */
	static ensure(): Promise<void> {
		return created ??= DB.read(db => {
			db.run(t.ddl());
		});
	}

	static async record(characterId: number, beatmapId: number, share: number): Promise<void> {
		await this.ensure();
		await new MemoryFail({
			characterId, beatmapId, playedAt: Date.now(), share,
		}).add();
	}

}
