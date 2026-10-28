import {
	DAO,
	DB,
	integer,
	table,
} from '../dao';

const t = table('score_sync', {
	userId:  integer(),
	version: integer(),
}, { primaryKey: ['userId'] });

/** The score version an account's local scores were last rebuilt at (online/scoreSync.ts). */
export class ScoreSync extends DAO(t) {

	static async versionOf(userId: number): Promise<number> {
		// a table registered after the database opened is not created yet
		await DB.read(db => db.run(t.ddl()));
		return (await this.first('SELECT * FROM score_sync WHERE userId = ?', [userId]))?.version ?? 0;
	}

}
