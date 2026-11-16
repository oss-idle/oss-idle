import type { RulesetId } from '@oss-idle/shared/rulesets/ids';

import Link from '../Link';

/** Covers a score card with a link to the score's page; the card's own links stay on top. */
export default function ScoreLink({ id, ruleset, label }: {
	id: number;
	ruleset: RulesetId;
	label: string;
}) {
	return <Link
		to='/scores/$ruleset/$id'
		params={{
			ruleset, id: String(id), 
		}}
		className='score-link'
		aria-label={label}
	/>;
}
