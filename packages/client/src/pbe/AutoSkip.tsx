import Checkbox from '../components/options/controls/Checkbox';
import { autoSkip } from './pbe';

/** PBE: plays finish as soon as they start, with the game open or closed. */
export default function AutoSkip() {
	return <Checkbox value={autoSkip} label="Skip every play to the end" />;
}
