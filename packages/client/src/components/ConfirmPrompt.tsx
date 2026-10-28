import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import ConfirmMenu, { type Confirm } from './ConfirmMenu';

const asked = new Synced<(Confirm & { onClose: () => void }) | undefined>(undefined);

/** Ask over whatever scene is up: true once confirmed, false when cancelled. */
export const askConfirm = (confirm: Omit<Confirm, 'onConfirm'>): Promise<boolean> =>
	new Promise(resolve => {
		const answer = (yes: boolean) => {
			void asked.set(undefined);
			resolve(yes);
		};
		void asked.set({
			...confirm, onConfirm: () => answer(true), onClose: () => answer(false),
		});
	});

export const confirmOpen = (): boolean => asked.get() !== undefined;

/** The {@link askConfirm} on screen. */
export default function ConfirmPrompt() {
	const [confirm] = useSynced(asked);
	return confirm && <ConfirmMenu {...confirm} />;
}
