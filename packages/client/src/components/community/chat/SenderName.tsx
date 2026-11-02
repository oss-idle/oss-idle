import {
	useEffect,
	useRef,
	useState,
} from 'react';

import type { PresenceEntry } from '@oss-idle/shared/community/presence';
import useSyncedSelect from '@oss-idle/shared/hooks/useSyncedSelect';

import { isCommunityOpen } from '../../../globals';
import { getCharacterCard } from '../../../online/services/characters';
import Socket from '../../../online/socket';
import {
	menuFor,
	type MenuTarget,
	showChat,
} from '../state';
import NameCardPopup from './NameCardPopup';
import useCardBanner from './useCardBanner';

const HOVER_MS = 350;
// time to cross the gap onto the card
const LEAVE_MS = 200;
// Chat.css .name-card
const CARD_W = 360, CARD_H = 112, GAP = 6, EDGE = 8;

/** A chat line's sender: a click opens the player menu, resting on it shows their card (online or not). */
export default function SenderName({ sender, name, color }: {
	sender?: MenuTarget,
	name: string,
	color?: string,
}) {
	const live = useSyncedSelect(Socket.presence, roster =>
		sender && roster.find(p => p.characterId === sender.characterId));
	const [at, setAt] = useState<{ left: number, top: number }>();
	const timer = useRef<number>(undefined);
	const cardRef = useRef<HTMLDivElement>(null);
	// read when hovered, for a player who isn't online
	const [offline, setOffline] = useState<PresenceEntry>();
	const card = live ?? (offline?.characterId === sender?.characterId ? offline : undefined);
	const bannerUrl = useCardBanner(card?.characterId, !!(card && at));

	const hide = () => {
		window.clearTimeout(timer.current);
		setAt(undefined);
	};
	const leave = () => {
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setAt(undefined), LEAVE_MS);
	};
	useEffect(() => {
		if (!at) return;
		const away = (e: Event) => {
			if (!cardRef.current?.contains(e.target as Node)) hide();
		};
		const shown = (on: boolean) => {
			if (!on) hide();
		};
		const stops = [showChat.forceSync(shown), isCommunityOpen.forceSync(shown)];
		window.addEventListener('wheel', away, true);
		window.addEventListener('mousedown', away, true);
		window.addEventListener('scroll', away, true);
		window.addEventListener('resize', hide);
		return () => {
			stops.forEach(stop => stop());
			window.removeEventListener('wheel', away, true);
			window.removeEventListener('mousedown', away, true);
			window.removeEventListener('scroll', away, true);
			window.removeEventListener('resize', hide);
		};
	}, [at]);
	const known = !!card;
	useEffect(() => {
		if (!known) hide();
	}, [known]);
	useEffect(() => () => window.clearTimeout(timer.current), []);

	const place = (el: HTMLElement) => {
		const r = el.getBoundingClientRect();
		const top = r.top - CARD_H - GAP >= EDGE ? r.top - CARD_H - GAP : r.bottom + GAP;
		setAt({
			left: Math.max(EDGE, Math.min(r.left, window.innerWidth - CARD_W - EDGE)), top,
		});
	};
	const show = (el: HTMLElement, characterId: number) => {
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			if (live) return place(el);
			getCharacterCard(characterId)
				.then(entry => {
					setOffline(entry);
					if (el.matches(':hover')) place(el);
				})
				.catch((e: unknown) => console.warn('[chat] no name card', e));
		}, HOVER_MS);
	};

	if (!sender) return <span>{name}</span>;
	return (<>
		<span
			className="chat__name"
			onMouseEnter={e => show(e.currentTarget, sender.characterId)}
			onMouseLeave={leave}
			onClick={e => {
				e.stopPropagation();
				hide();
				void menuFor.set({ ...sender });
			}}
		>{name}</span>
		{card && at && (
			<NameCardPopup
				p={card}
				offline={!live}
				color={color}
				bannerUrl={bannerUrl}
				at={at}
				cardRef={cardRef}
				onMouseEnter={() => window.clearTimeout(timer.current)}
				onMouseLeave={hide}
			/>
		)}
	</>);
}
