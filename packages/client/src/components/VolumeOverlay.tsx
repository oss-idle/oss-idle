import './VolumeOverlay.css';

import {
	useRef,
	useState,
} from 'react';

import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';
import clamp from '@oss-idle/shared/math/clamp';

import useSmoothNumber from '../animations/useSmoothNumber';
import { notchTick } from '../audio/uiSounds';
import { SETTINGS } from '../db/settings';
import { isVolumeVisible } from '../globals';
import Controls from '../input/Controls';

type Channel = 'main' | 'music' | 'effects';

/** how much one wheel notch moves the active volume */
const STEP = 0.05;
/** how long the overlay lingers after the last change (osu-like) */
const HIDE_MS = 1500;

const CHANNELS: Record<Channel, Synced<number>> = {
	main: SETTINGS.mainVolume,
	music: SETTINGS.musicVolume,
	effects: SETTINGS.effectVolume,
};

/**
 * osu-style volume overlay. Scrolling (see Controls.volumeUp/Down) bumps a
 * channel and pops the overlay up; it fades out after a moment. Hovering a dial
 * makes scrolls target that channel - with nothing hovered, scrolls hit Main.
 *
 * Standalone and global: mounted once from App, independent of the scene.
 */
export default function VolumeOverlay() {
	const [main] = useSynced(SETTINGS.mainVolume);
	const [musicVol] = useSynced(SETTINGS.musicVolume);
	const [fxVol] = useSynced(SETTINGS.effectVolume);

	const [visible] = useSynced(isVolumeVisible);
	const [hovered, setHovered] = useState<Channel | null>(null);
	// mirrored in a ref so the (effect-scoped) wheel handler reads the live value
	const hoveredRef = useRef<Channel | null>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const armHide = (run: () => void) => {
		if (hideTimer.current) clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(run, HIDE_MS);
	};

	const adjust = (delta: number) => {
		const channel = CHANNELS[hoveredRef.current ?? 'main'];
		const next = clamp(Math.round((channel.get() + delta) * 100) / 100, 0, 1);
		void channel.set(next);
		notchTick(next, 0.1);
		isVolumeVisible.set(true);
		armHide(() => { if (!hoveredRef.current) isVolumeVisible.set(false); });
	};

	Controls.volumeUp.use(() => adjust(STEP));
	Controls.volumeDown.use(() => adjust(-STEP));

	const enter = (channel: Channel) => {
		hoveredRef.current = channel;
		setHovered(channel);
		isVolumeVisible.set(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
	};
	const leave = () => {
		hoveredRef.current = null;
		setHovered(null);
		armHide(() => isVolumeVisible.set(false));
	};

	// with nothing hovered, Main is the active (scroll) target
	const active: Channel = hovered ?? 'main';

	return (
		<div className={`vol ${visible ? 'is-visible' : ''}`}>
			<div className="vol__row">
				<Meter label="music" value={musicVol} active={active === 'music'} position={2}
					onEnter={() => enter('music')} onLeave={leave} />
				<Meter label="master" value={main} large active={active === 'main'} position={1}
					onEnter={() => enter('main')} onLeave={leave} />
				<Meter label="effect" value={fxVol} active={active === 'effects'} position={3}
					onEnter={() => enter('effects')} onLeave={leave} />
			</div>
		</div>
	);
}

type MeterProps = {
	label: string;
	value: number;
	position: number;
	active: boolean;
	large?: boolean;
	onEnter: () => void;
	onLeave: () => void;
};

/** A circular dial that fills clockwise from the top in proportion to `value`. */
function Meter({ 
	label,
	value, 
	position,
	active,
	large, 
	onEnter, 
	onLeave, 
}: MeterProps) {
	// ease the displayed level so both the ring and the % glide on change
	const shown = useSmoothNumber(value, { duration: 200 });
	const size = large ? 124 : 96;
	const stroke = large ? 9 : 7;
	const r = (size - stroke) / 2;
	const circumference = 2 * Math.PI * r;
	const offset = circumference * (1 - Math.max(0, Math.min(1, shown)));

	return (
		<div
			className={
				`vol__meter vol__pos${position} ${active ? 'is-active' : ''} ${large ? 'is-large' : ''}`
			}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
		>
			<svg 
				className="vol__ring" 
				width={size}
				height={size} 
				viewBox={`0 0 ${size} ${size}`}
			>
				<circle 
					className="vol__track" 
					cx={size / 2} 
					cy={size / 2}
					r={r} 
					strokeWidth={stroke} 
					fill="none" 
				/>
				<circle
					className="vol__fill"
					cx={size / 2} cy={size / 2} r={r}
					strokeWidth={stroke} fill="none" strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
				/>
			</svg>
			<div className="vol__center">
				<span className="vol__pct">{Math.round(shown * 100)}%</span>
				<span className="vol__label">{label}</span>
			</div>
		</div>
	);
}
