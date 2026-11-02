import { useState } from 'react';

import {
	rpc,
	unwrap,
} from '../api/client';
import {
	refreshCurrentUser,
	useCurrentUser,
} from '../hooks/useCurrentUser';

/** PBE: the oss!supporter tag is a setting, there is no store here. */
export default function SupporterSettings() {
	const user = useCurrentUser();
	const [busy, setBusy] = useState(false);

	const change = async (on: boolean) => {
		setBusy(true);
		try {
			await unwrap(rpc.v1.pbe.supporter.$put({ json: { on } }));
			await refreshCurrentUser();
			// the game listens for this to read the account again
			localStorage.setItem('oss-idle:auth', String(Date.now()));
		} finally {
			setBusy(false);
		}
	};

	return <label className='settings__radio'>
		<input
			type='checkbox'
			className='settings__check'
			checked={user?.supporter ?? false}
			disabled={busy}
			onChange={e => void change(e.target.checked)}
		/>
		oss!supporter tag
	</label>;
}
