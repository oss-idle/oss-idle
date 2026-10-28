import '../Docs.css';

import { useState } from 'react';

import Link from '../../../components/Link';
import DocsToc, { type TocItem } from '../DocsToc';
import {
	goToHeading,
	useActiveHeading,
} from '../useActiveHeading';
import AddonDocsEditor from './AddonDocsEditor';
import AddonDocsGuide from './AddonDocsGuide';
import AddonDocsGuidelines from './AddonDocsGuidelines';

const item = (id: string, title: string, children?: TocItem[]): TocItem => ({
	id, title, children,
});

const TOC: TocItem[] = [
	item('introduction', 'Introduction'),
	item('making-one', 'Making one'),
	item('the-contract', 'The contract', [item('the-api', 'The API')]),
	item('types-and-tags', 'Types and tags'),
	item('react', 'The game\'s React'),
	item('the-editor', 'The editor', [item('editor-api', 'The editor API')]),
	item('guidelines', 'Guidelines', [
		item('code-rules', 'Code the game refuses'),
		item('good-add-ons', 'Good add-ons'),
		item('publishing', 'Publishing'),
	]),
];

/** Writing add-ons: the guide for authors, in the API docs' layout. English only, not sent to Crowdin. */
export default function AddonDocs() {
	const active = useActiveHeading();
	const [menu, setMenu] = useState(false);
	const go = (id: string) => {
		goToHeading(id);
		setMenu(false);
	};

	return <div className='docs'>
		<button type='button' className='docs__menu' onClick={() => setMenu(!menu)}>MENU</button>
		<nav className={`docs-toc ${menu ? 'docs-toc--open' : ''}`}>
			<DocsToc
				items={TOC}
				active={active}
				onGo={go}
				footer={<>
					<li><Link to='/'>oss!idle</Link></li>
					<li><Link to='/docs'>API documentation</Link></li>
					<li><Link to='/legal/rules'>Rules</Link></li>
				</>}
			/>
		</nav>
		<div className='docs__page'>
			<div className='docs__dark' />
			<div className='docs__content'>
				<AddonDocsGuide />
				<AddonDocsEditor />
				<AddonDocsGuidelines />
			</div>
		</div>
	</div>;
}
