import {
	useRef,
	useState,
} from 'react';

import Log from '@oss-idle/shared/helpers/log';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import Button from '../components/options/controls/Button';
import Auth from '../online/auth';
import { rpc } from '../online/client';

const CONFIRM_MS = 3000;

/** PBE: wipes the account's characters. The reload lands on character creation. */
export default function ResetCharacter() {
	const [user] = useSynced(Auth.user);
	const [armed, setArmed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	if (!user) return <></>;

	const reset = async () => {
		const res = await rpc.v1.pbe.reset.$post();
		if (!res.ok) throw new Error(`reset failed (${res.status})`);
		location.reload();
	};

	const click = () => {
		if (!armed) {
			setArmed(true);
			timer.current = setTimeout(() => setArmed(false), CONFIRM_MS);
			return;
		}
		clearTimeout(timer.current);
		setArmed(false);
		reset().catch((e) => Log.errorPopup(String(e)));
	};

	return (
		<Button
			accent="#d64045"
			onClick={click}
			label={armed ? 'Click again to delete everything' : 'Reset my character and scores'}
		/>
	);
}
