import type { AdminMetrics } from '../../../api/admin';
import { num } from './format';
import Panel from './Panel';
import TimeChart from './TimeChart';

type Props = { metrics: AdminMetrics };

/** A gauge sampled once a minute: 0 means no sample there. */
const gauge = (values: number[]) => values.map(v => (v ? v : undefined));

/** What players did: who was on, plays, logins, signups, chat. */
export default function Activity({ metrics }: Props) {
	const a = metrics.activity;
	const chart = {
		start: metrics.start, bucketMs: metrics.bucketMs, format: num,
	};
	return (
		<Panel title='Players' note='Counts per 5 minutes'>
			<div className='admin-dashboard__grid'>
				<TimeChart
					{...chart}
					title='Online and playing'
					note='highest each 5 minutes; online includes games closed but playing on'
					series={[
						{
							label: 'Online', slot: 1, values: gauge(a.online),
						},
						{
							label: 'Game open', slot: 3, values: gauge(a.clients),
						},
						{
							label: 'In a play', slot: 2, values: gauge(a.playing),
						},
						{
							label: 'Local guests', slot: 'gray', values: gauge(a.guests),
						},
					]}
				/>
				<TimeChart
					{...chart}
					title='Plays'
					series={[
						{
							label: 'Started', slot: 1, values: a.plays_started,
						},
						{
							label: 'Finished', slot: 2, values: a.plays_finished,
						},
					]}
				/>
				<TimeChart
					{...chart}
					title='Logins and signups'
					series={[
						{
							label: 'Logins', slot: 1, values: a.logins,
						},
						{
							label: 'New characters', slot: 2, values: a.signups,
						},
					]}
				/>
				<TimeChart
					{...chart}
					title='Chat and connections'
					series={[
						{
							label: 'Chat lines', slot: 1, values: a.chat,
						},
						{
							label: 'Sockets opened', slot: 3, values: a.sockets,
						},
					]}
				/>
			</div>
		</Panel>
	);
}
