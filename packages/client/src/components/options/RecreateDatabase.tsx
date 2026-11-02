import { Trans } from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import Log from '@oss-idle/shared/helpers/log';

import { DB } from '../../db/dao';
import Button from './controls/Button';

/** How long the "are you sure" arming lasts before reverting. */
const CONFIRM_MS = 3000;

export default function RecreateDatabase() {
	const [armed, setArmed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	const click = () => {
		if (!armed) {
			setArmed(true);
			timer.current = setTimeout(() => setArmed(false), CONFIRM_MS);
			return;
		}
		clearTimeout(timer.current);
		setArmed(false);
		void DB.discard()
			.then(() => location.reload())
			.catch((e) => Log.errorPopup(String(e)));
	};

	return (
		<Button
			accent="#d64045"
			onClick={click}
			label={armed ?
				<Trans>Click again to confirm</Trans>
				: <Trans>Recreate local database</Trans>
			}
		/>
	);
}
