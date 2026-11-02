import './Onboarding.css';

import { ph } from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';

import { geneticChoice } from '../globals';
import useKeyboardOwner, { LAYER } from '../input/keyboardOwner';
import Account from '../online/account';
import Auth from '../online/auth';
import { selectedDef } from '../rulesets/registry';

/**
 * First-login onboarding. Shown once when signed in but the account has no
 * character yet: name the character (default = osu! username). The account
 * always starts fresh - local Guest progress is no longer migrated online.
 */
export default function Onboarding() {
	const { t } = useLingui();
	const [needs] = useSynced(Account.needsOnboarding);
	const [user] = useSynced(Auth.user);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	useKeyboardOwner(nameRef, {
		active: !!needs && !!user, layer: LAYER.ONBOARDING, 
	});

	// Prefill the name with the osu! username once it's known.
	useEffect(() => { if (user) setName(user.username); }, [user]);

	if (!needs || !user) return null;

	const pickAvatar = async (file: File | undefined) => {
		if (!file || uploading) return;
		setUploading(true);
		setError(null);
		try {
			await Auth.uploadAvatar(file);
		} catch (e) {
			setError(String(e));
		} finally {
			setUploading(false);
		}
	};

	const submit = async () => {
		if (!name.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			await Account.complete({ name: name.trim() });
			if (selectedDef().genetics) void geneticChoice.set('first');
		} catch (e) {
			setError(String(e));
			setBusy(false);
		}
	};

	return (
		<div className="onboard">
			<div className="onboard__card">
				<h1 className="onboard__title"><Trans>Welcome, {ph({ username: user.username })}!</Trans></h1>
				<p className="onboard__sub">
					<Trans>Create your first character to finish setting up your account.</Trans>
				</p>
				<p className="onboard__sub">
					<Trans>
						Online characters always start fresh: Guest progress stays local,
						so the leaderboards stay fair.
					</Trans>
				</p>

				<div className="onboard__avatar-field">
					<button
						type="button"
						className="onboard__avatar"
						onClick={() => fileInput.current?.click()}
						disabled={uploading}
						title={t`Upload a profile picture`}
					>
						<img 
							className="onboard__avatar-img" 
							src={user.avatarUrl ?? GUEST_AVATAR_URL} 
							alt="" />
						<span className="onboard__avatar-overlay">
							{uploading ? t`Uploading…` : t`Change`}
						</span>
					</button>
					<span className="onboard__avatar-hint">
						<Trans>Profile picture<br />Defaults to your osu! avatar</Trans>
					</span>
					<input
						ref={fileInput}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						hidden
						onChange={e => { void pickAvatar(e.target.files?.[0]); e.target.value = ''; }}
					/>
				</div>

				<label className="onboard__field">
					<span className="onboard__label"><Trans>Character name</Trans></span>
					<input
						ref={nameRef}
						className="onboard__input"
						value={name}
						onChange={e => setName(e.target.value)}
						maxLength={32}
						disabled={busy}
					/>
				</label>

				{error && <p className="onboard__error">{error}</p>}

				<div className="onboard__actions">
					<button
						className="onboard__btn onboard__btn--primary"
						disabled={busy || !name.trim()}
						onClick={submit}
					>
						<Trans>Create character</Trans>
					</button>
				</div>
			</div>
		</div>
	);
}
