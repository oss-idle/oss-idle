import { Trans } from '@lingui/react/macro';

import {
	type Locale,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
} from '@oss-idle/shared/i18n/locales';

import { SETTINGS } from '../../db/settings';
import Dropdown from '../dropdown/Dropdown';

/** Under this, the picker says how much of a language is translated. */
const SHOW_COMPLETION_UNDER = 90;

const languageLabel = (locale: Locale) => {
	const completion = __CATALOG_COMPLETION__[locale];
	return completion < SHOW_COMPLETION_UNDER
		? `${LOCALE_LABELS[locale]} (${completion}%)`
		: LOCALE_LABELS[locale];
};

const LANGUAGE_OPTIONS = SUPPORTED_LOCALES.map((locale) => ({
	value: locale as Locale,
	label: languageLabel(locale),
}));

/** The catalog activation itself is wired globally (main.tsx subscribes to the
 *  setting), so this only owns the picker. */
export default function Language() {
	return (
		<div className="opt-row">
			<span className="opt-row__label"><Trans>Select language</Trans></span>
			<Dropdown value={SETTINGS.language} options={LANGUAGE_OPTIONS} />
		</div>
	);
}
