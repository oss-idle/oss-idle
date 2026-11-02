import './page.css';

import { Trans } from '@lingui/react/macro';
import {
	type ReactNode,
	useState,
} from 'react';

import {
	type PageAction,
	PageBackdropSlot,
	PageBarSlot,
} from './pageBar';
import PageBarButton from './PageBarButton';

export type PageTab = {
	/** Stable id; also the active-tab key. */
	id: string,
	label: ReactNode,
	/** Overrides the page subtitle while this tab is active. */
	subtitle?: ReactNode,
	/** Rendered into the body only while active */
	render: () => ReactNode,
};

type TabsProps = { 
	tabs: PageTab[], 
	initialTab?: string,
	onTabChange?: (id: string) => void, 
	children?: never 
};

type NoTabsProps = { 
	tabs?: undefined,
	children: ReactNode 
};

type Props = {
	title: ReactNode,
	subtitle?: ReactNode,
	/** Bottom-bar Close action (a default action at order 0). */
	onBack: () => void,
	/** Extra default bar actions beside Close */
	actions?: PageAction[],
} & (
	| TabsProps
	| NoTabsProps
);

/**
 * The osu!-styled scene chrome: skewed tabs, a large thin title, a scrolling
 * body, and the signature bottom action bar. Pass `tabs` to get a self-managed
 * tabbed page (each tab owns its content), or plain `children` for one body.
 * Sub-views portal their own action buttons into the bar with PageBarActions.
 */
export default function Page(props: Props) {
	const { title, subtitle, onBack } = props;
	const tabs = props.tabs;
	const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
	const [backdrop, setBackdrop] = useState<HTMLElement>();
	const [activeId, setActiveId] = useState(() => props.tabs && (
		props.initialTab ?? props.tabs[0]?.id
	));

	const active = tabs && (tabs.find(t => t.id === activeId) ?? tabs[0]);

	const buttons: PageAction[] = [
		{ 
			id: 'back', 
			label: <Trans>Close</Trans>, 
			onClick: onBack, 
			order: 0, 
		},
		...(props.actions ?? []),
	];

	const select = (id: string) => {
		setActiveId(id);
		if (props.tabs) props.onTabChange?.(id);
	};

	return (
		<div className='page'>
			<div className='page__backdrop' ref={el => el && setBackdrop(el)} />
			{tabs && (
				<nav className='page__tabs'>
					{tabs.map(tab => (
						<button 
							key={tab.id} 
							className={`page__tab ${tab === active ? 'is-active' : ''}`} 
							onClick={() => select(tab.id)}
						>
							<span>{tab.label}</span>
						</button>
					))}
				</nav>
			)}

			<div className='page__header'>
				<span className='page__title'>{title}</span>
				{(active?.subtitle ?? subtitle) && <span className='page__subtitle'>
					{active?.subtitle ?? subtitle}
				</span>}
			</div>

			<main className='page__body'>
				<PageBackdropSlot.Provider value={backdrop}>
					<PageBarSlot.Provider value={barSlot}>
						{active ? active.render() : props.children}
					</PageBarSlot.Provider>
				</PageBackdropSlot.Provider>
			</main>

			<footer className='page__bottombar'>
				{buttons.map(a => <PageBarButton key={a.id} action={a} />)}
				<div className='page__barslot' ref={setBarSlot} />
			</footer>
		</div>
	);
}
