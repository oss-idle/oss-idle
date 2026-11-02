import './LocaleMenu.css';

import { useLingui } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import {
	type Locale,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
} from '@oss-idle/shared/i18n/locales';

import Flag from './components/Flag';
import { activateLocale } from './i18n';
import { saveLocale } from './locale';

const LOCALE_FLAGS: Record<Locale, string> = {
	en: 'GB',
	de: 'DE',
	es: 'ES',
	fil: 'PH',
	fr: 'FR',
	ru: 'RU',
	vi: 'VN',
};

/** The header's language button: the current flag, opening the list of languages, like osu!web's. */
export default function LocaleMenu() {
	const { i18n } = useLingui();
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const current = i18n.locale as Locale;

	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (event.target instanceof Node && root.current?.contains(event.target)) return;
			setOpen(false);
		};
		document.addEventListener('pointerdown', close, true);
		return () => document.removeEventListener('pointerdown', close, true);
	}, [open]);

	const pick = (locale: Locale) => {
		setOpen(false);
		saveLocale(locale);
		void activateLocale(locale);
	};

	return <div ref={root} className='topbar__link topbar__locale-root'>
		<button
			type='button'
			className={`topbar__locale ${open ? 'active' : ''}`}
			aria-label={LOCALE_LABELS[current]}
			aria-expanded={open}
			onClick={() => setOpen(!open)}
		>
			<Flag country={LOCALE_FLAGS[current]} alt='' />
		</button>
		{open && <div className='usermenu topbar__locale-menu'>
			<div className='usermenu_links'>
				{SUPPORTED_LOCALES.map(locale => <button
					key={locale}
					type='button'
					className={`usermenu__link topbar__locale-item ${locale === current ? 'is-current' : ''}`}
					onClick={() => locale !== current && pick(locale)}
				>
					<Flag country={LOCALE_FLAGS[locale]} alt='' />
					{LOCALE_LABELS[locale]}
				</button>)}
			</div>
		</div>}
	</div>;
}
