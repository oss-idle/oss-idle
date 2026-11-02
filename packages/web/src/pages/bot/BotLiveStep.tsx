/** One step of a running match: its text, and how far it has got while it's the current one. */
export default function BotLiveStep({ label, state, share }: {
	label: string;
	state: 'done' | 'now' | 'later';
	share?: number;
}) {
	return <div className={`bot-step is-${state}`}>
		<div className='bot-step__label'>{label}</div>
		{state === 'now' && <div className='bot-step__bar'>
			<div className='bot-step__fill' style={{ width: `${(share ?? 0) * 100}%` }} />
		</div>}
	</div>;
}
