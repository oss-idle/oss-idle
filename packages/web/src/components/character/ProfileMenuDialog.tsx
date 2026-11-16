import DeleteAccountDialog from './DeleteAccountDialog';
import GiveSupporterDialog from './GiveSupporterDialog';
import ReportDialog from './ReportDialog';
import RestrictDialog from './RestrictDialog';
import RollbackUpgradeDialog from './RollbackUpgradeDialog';
import SilenceDialog from './SilenceDialog';

export type ProfileDialog = 'report' | 'silence' | 'restrict' | 'delete' | 'rollback' | 'supporter';

const reload = () => window.location.reload();

/** The dialog a profile ⋮ menu item opened. */
export default function ProfileMenuDialog({ dialog, userId, characterId, name, onClose }: {
	dialog: ProfileDialog;
	userId: number;
	characterId: number;
	name: string;
	onClose: () => void;
}) {
	switch (dialog) {
		case 'report':
			return <ReportDialog userId={userId} name={name} onClose={onClose} />;
		case 'silence':
			return <SilenceDialog userId={userId} name={name} onDone={reload} onClose={onClose} />;
		case 'restrict':
			return <RestrictDialog userId={userId} name={name} onDone={reload} onClose={onClose} />;
		case 'delete':
			return <DeleteAccountDialog
				userId={userId}
				onDone={() => window.location.assign('/web/')}
				onClose={onClose}
			/>;
		case 'supporter':
			return <GiveSupporterDialog userId={userId} name={name} onDone={reload} onClose={onClose} />;
		case 'rollback':
			return <RollbackUpgradeDialog
				characterId={characterId}
				name={name}
				onDone={reload}
				onClose={onClose}
			/>;
	}
}
