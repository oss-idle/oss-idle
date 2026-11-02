import type { ApprovedStatus } from '@oss-idle/shared/beatmap';

const HOUR = 3600e3;
// Quick-schedule windows: a random moment within the next hour/day/week/month.
const WINDOWS: [label: string, ms: number][] = [
	['hour', HOUR],
	['day', 24 * HOUR],
	['week', 7 * 24 * HOUR],
	['month', 30 * 24 * HOUR],
];

const RANK_NOW: Record<ApprovedStatus, string> = {
	ranked: 'Rank now', loved: 'Love now',
};

/** Ranking a set that isn't live: at the picked date, at a random time soon, or now. */
export default function NominationSchedule({
	busy, date, category, onSchedule, onRankNow, onScheduleIn,
}: {
	busy: boolean;
	date: string;
	category: ApprovedStatus;
	onSchedule: () => void;
	onRankNow: () => void;
	onScheduleIn: (ms: number) => void;
}) {
	return <>
		<div className='nomination__quick'>
			<span className='nomination__label'>Random in</span>
			{WINDOWS.map(([label, ms]) => (
				<button key={label} className='nomination__btn' disabled={busy}
					title={`Schedule randomly within the next ${label}`} onClick={() => onScheduleIn(ms)}>
					{label}
				</button>
			))}
		</div>
		<button 
			className='nomination__btn nomination__btn--primary' 
			disabled={busy || !date} 
			onClick={onSchedule}
		>
			Schedule
		</button>
		<button className='nomination__btn' disabled={busy} onClick={onRankNow}>
			{RANK_NOW[category]}
		</button>
	</>;
}
