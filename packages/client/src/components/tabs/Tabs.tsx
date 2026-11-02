import './Tabs.css';

import {
	type ReactNode,
	useEffect,
} from 'react';

import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { uiSound } from '../../audio/uiSounds';

export type Tab<Id extends string = string> = {
	id: Id,
	label: ReactNode,
	/** `read`: a chat tab with nothing new, drawn dark */
	className?: 'special' | 'read',
	render: () => ReactNode,
	onClick?: () => void,
};

export type TabsProps<Id extends string> = {
	active: Synced<Id | undefined>,
	tabs: Tab<Id>[],
	className?: 'classic' | 'next',
	initialTab?: Id,
	onSelect?: (id: Id) => void,
};

export default function Tabs<Id extends string>({
	className,
	tabs,
	initialTab,
	active,
	onSelect,
}: TabsProps<Id>) {
	const [activeId] = useSynced(active);

	// Select a default (or fall back) when the active id points at no tab.
	useEffect(() => {
		if (!tabs.some(t => t.id === activeId)) active.set(initialTab ?? tabs[0]?.id);
	}, [active, tabs, activeId, initialTab]);

	const select = (id: Id) => {
		if (id !== activeId) uiSound('ui/tabselect-select');
		void active.set(id);
		onSelect?.(id);
	};

	return <nav className={`tabs ${className ?? 'classic'}`}>
		{tabs.map(tab => (
			<button
				key={tab.id}
				className={`tab ${tab.id === activeId ? 'is-active' : ''} ${tab.className}`}
				data-sound="hover"
				onClick={() => { tab.onClick?.(); select(tab.id); }}
			>
				<span>{tab.label}</span>
			</button>
		))}
	</nav>;
}
