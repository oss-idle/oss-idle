import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { ph } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { giveBody } from '@oss-idle/shared/supporter';

import { giveSupporter } from '../../api/store';
import ConfirmDialog from './ConfirmDialog';

/** Admin: add months of oss!supporter to an account, with no order behind them. */
export default function GiveSupporterDialog({ userId, name, onDone, onClose }: {
	userId: number;
	name: string;
	onDone: () => void;
	onClose: () => void;
}) {
	const { t } = useLingui();
	const [months, setMonths] = useState<number | undefined>(1);
	const body = giveBody.safeParse({ months });

	return <ConfirmDialog
		icon={faHeart}
		title={t`Give oss!supporter to ${ph({ name })}?`}
		sendLabel={t`Give`}
		canSend={body.success}
		send={async () => {
			if (body.success) await giveSupporter(userId, body.data.months);
		}}
		onDone={onDone}
		onClose={onClose}
	>
		<div className='report-dialog__label'>{t`Months to add`}</div>
		<input
			type='number'
			min={1}
			value={months ?? ''}
			onChange={e => setMonths(e.target.value === '' ? undefined : Number(e.target.value))}
		/>
	</ConfirmDialog>;
}
