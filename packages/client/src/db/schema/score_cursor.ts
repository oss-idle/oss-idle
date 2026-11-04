import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import {
	boolean,
	DAO,
	DB,
	integer,
	table,
	text,
} from '../dao';

const t = table('score_cursor', {
	userId:   integer(),
	ruleset:  text<RulesetId>(),
	unranked: boolean(),
	after:    integer(),
}, { primaryKey: ['userId', 'ruleset', 'unranked'] });

/** The last server score id an account's local copies were pulled up to, per ruleset and
 *  kind (online/scoreSync.ts). */
export class ScoreCursor extends DAO(t) {

	/** None until a pull or rebuild has brought this ruleset and kind up. */
	static async of(
		userId: number, ruleset: RulesetId, unranked: boolean,
	): Promise<number | undefined> {
		// a table registered after the database opened is not created yet
		await DB.read(db => db.run(t.ddl()));
		return (await this.get({
			userId, ruleset, unranked,
		}))?.after;
	}

	static async set(
		userId: number, ruleset: RulesetId, unranked: boolean, after: number,
	): Promise<void> {
		await new ScoreCursor({
			userId, ruleset, unranked, after,
		}).add();
	}

}
