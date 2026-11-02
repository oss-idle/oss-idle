import './Legal.css';

import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import type {
	Bilingual,
	Block,
} from './documents/types';
import { UPDATED } from './identity';
import LinkedText from './LinkedText';

const block = (b: Block, i: number) => {
	if (typeof b === 'string') return <p key={i}><LinkedText text={b} /></p>;
	if ('sub' in b) return <h3 key={i}>{b.sub}</h3>;
	return <ul key={i}>{b.list.map((item, j) => <li key={j}><LinkedText text={item} /></li>)}</ul>;
};

/** A legal page, in French for French speakers and in English for everyone else. Not translated
 *  through Weblate: a legal text has to say exactly what was written. */
export default function LegalDocument({ doc }: { doc: Bilingual }) {
	const { i18n } = useLingui();
	const [lang, setLang] = useState<'en' | 'fr'>(i18n.locale.startsWith('fr') ? 'fr' : 'en');
	const text = doc[lang];
	const other = lang === 'fr' ? 'en' : 'fr';

	return <article className='legal'>
		<div className='legal__header'>
			<h2>{text.title}</h2>
			<button type='button' className='legal__lang' onClick={() => setLang(other)}>
				{other === 'fr' ? 'Version française' : 'English version'}
			</button>
		</div>
		<p className='legal__updated'>
			{lang === 'fr' ? `Mis à jour le ${UPDATED.fr}` : `Updated ${UPDATED.en}`}
		</p>
		{text.sections.map(section => <section key={section.title}>
			<h2>{section.title}</h2>
			{section.blocks.map(block)}
		</section>)}
	</article>;
}
