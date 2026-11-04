import { Trans } from '@lingui/react/macro';

import type { BoardRow } from '../../api/maps';
import { judgementColumns } from './judgementColumns';
import ScoreboardRow from './ScoreboardRow';

/** The board's table, with a DIVINE column when any score on it has one. */
export default function MapScoreTable({ rows, loved }: { rows: BoardRow[]; loved: boolean }) {
	const columns = judgementColumns(rows.map(row => row.score.judgements.DIVINE));
	return <table className='mapset__table'>
		<thead>
			<tr>
				<th><Trans>Rank</Trans></th>
				<th />
				<th><Trans>Score</Trans></th>
				<th><Trans>Accuracy</Trans></th>
				<th><Trans>Player</Trans></th>
				<th><Trans>Max Combo</Trans></th>
				{columns.map(j => <th key={j.judgement}>{j.label}</th>)}
				{!loved && <th>pp</th>}
				<th><Trans>Time</Trans></th>
				<th><Trans>Mods</Trans></th>
			</tr>
		</thead>
		<tbody>
			{rows.map((row, i) => <ScoreboardRow
				key={row.score.id}
				row={row}
				rank={i + 1}
				loved={loved}
				columns={columns}
			/>)}
		</tbody>
	</table>;
}
