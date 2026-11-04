import './Login.css';

import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import { bignum } from '@oss-idle/shared/display/num';
import useAsync from '@oss-idle/shared/hooks/useAsync';

import { getGeneralStats } from '../api/stats';
import { loginWithOsu } from '../auth';
import AuthBackdrop from '../components/AuthBackdrop';
import { Asset } from '../router';

const count = (n = 0) => bignum(n);

export default function Login() {
	const { t } = useLingui();
	const stats = useAsync(getGeneralStats, []);

	return (
		<AuthBackdrop>
			<div className="login__logo">
				<img src={Asset('/idle-back.png')} alt="" />
				<img src={Asset('/idle-white.png')} alt="oss!idle" />
			</div>
			<h1><Trans>Become a legendary mania player</Trans></h1>
			<p className="auth__text"><Trans>Sign in with osu! and create your character.</Trans></p>
			<button type="button" className="cta-button login__osu" onClick={loginWithOsu}>
				<img src={Asset('/idle.png')} alt="" />
				<Trans>Sign in with osu!</Trans>
			</button>
			<p className="auth__fine"><Trans>We only use your osu! username, avatar and country.</Trans></p>
			<ul className="login__stats">
				<li><b>{count(stats?.users)}</b> {t`characters`}</li>
				<li><b>{count(stats?.online)}</b> {t`online now`}</li>
				<li><b>{count(stats?.playing)}</b> {t`playing now`}</li>
			</ul>
		</AuthBackdrop>
	);
}
