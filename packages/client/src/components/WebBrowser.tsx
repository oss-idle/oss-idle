import './WebBrowser.css';

import { useLingui } from '@lingui/react/macro';
import {
	useEffect,
	useRef,
	useState,
} from 'react';

import useSynced from '@oss-idle/shared/hooks/useSynced';

import { music } from '../audio/MusicPlayer';
import { copyText } from '../clipboard';
import {
	isWebOpen,
	SITE_URL,
	webUrl,
} from '../globals';
import useKeyboardOwner, { LAYER } from '../input/keyboardOwner';

/** The page's address as someone else can open it. */
const shareUrl = (path: string): string => `${SITE_URL}${path}`;

/**
 * Lazer-style in-game browser: a fullscreen overlay that embeds the oss! web
 * platform (`/web`) in a same-origin iframe with minimal chrome
 * (back / forward / reload, the page's link to share, close).
 *
 * Because the frame is same-origin we can drive its history directly - and,
 * later, the OAuth flow can `postMessage` tokens back to the game across it.
 *
 * Mounted once from App (like VolumeOverlay); hidden via CSS when closed so the
 * frame keeps its state. The iframe is created lazily on first open.
 */
export default function WebBrowser() {
	const { t } = useLingui();

	const [open] = useSynced(isWebOpen);
	const [url] = useSynced(webUrl);
	const frameRef = useRef<HTMLIFrameElement>(null);
	useKeyboardOwner(frameRef, {
		active: open, layer: LAYER.WEB, close: () => isWebOpen.set(false),
	});
	const [src, setSrc] = useState<string>();
	const [loaded, setLoaded] = useState(false);

	// The site routes in-page (history.pushState), which fires no load event, so
	// the address is read off the frame while it is open.
	const [address, setAddress] = useState('');
	useEffect(() => {
		if (!open) return;
		const read = () => {
			const loc = frameRef.current?.contentWindow?.location;
			if (loc?.pathname.startsWith('/web')) setAddress(shareUrl(loc.pathname + loc.search));
		};
		read();
		const timer = setInterval(read, 500);
		return () => clearInterval(timer);
	}, [open]);


	const frameWindow = () => frameRef.current?.contentWindow ?? undefined;

	// a map's preview on the page plays over the music, muted meanwhile
	useEffect(() => {
		const onMessage = (e: MessageEvent<{ type?: string, playing?: boolean }>) => {
			if (e.source !== frameWindow() || e.data?.type !== 'oss-idle:preview') return;
			void music.muted.set(!!e.data.playing);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, []);

	// Create the iframe on first open and never tear it down. Each open sends it
	// to the asked page, which may be the url it was last opened on.
	useEffect(() => {
		if (!open) return;
		const target = `/web/${url}`;
		const loc = frameWindow()?.location;
		if (!loc) setSrc(target);
		else if (loc.pathname + loc.search !== target) loc.assign(target);
	}, [open, url]);
	const close = () => isWebOpen.set(false);

	// The web platform is served under /web. When the embedded page navigates
	// anywhere else (its "play" link does a top-level location change to the game
	// at the origin root), that's our cue to leave: close the overlay instead of
	// booting a second game inside the frame, and send the frame back to the site
	// so it's ready for the next open. Same-origin, so reading location is safe.
	const onFrameLoad = () => {
		const win = frameWindow();
		if (win && !win.location.pathname.startsWith('/web')) {
			close();
			win.location.replace('/web/');
			return; // keep the spinner up; the replace reloads the site
		}
		setLoaded(true);
		// the frame holds the keyboard, so Escape lands in it: an Escape the page
		// itself did not use, outside its fields (a rename, a search), closes the browser
		win?.addEventListener('keydown', (e) => {
			// the frame's own elements: no instanceof across windows
			const el = e.target as HTMLElement | null;
			const field = !!el
				&& (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
			if (e.key === 'Escape' && !e.defaultPrevented && !field) close();
		});
		// Re-show the spinner the instant the next full navigation starts, so the
		// game never flashes inside the frame while the origin root loads.
		win?.addEventListener('beforeunload', () => {
			setLoaded(false);
			void music.muted.set(false);
		}, { once: true });
	};

	return (
		<div className={`web ${open ? 'is-open' : ''}`} aria-hidden={!open}>
			<div className={`web-inner ${loaded ? 'is-loaded' : ''}`} aria-hidden={!open}>
				<div className="web__chrome">
					<button 
						className="web__btn" 
						title={t`Back`} 
						onClick={() => frameWindow()?.history.back()}
					>
						‹
					</button>
					<button
						className="web__btn" 
						title={t`Forward`} 
						onClick={() => frameWindow()?.history.forward()}
					>
						›
					</button>
					<button
						className="web__btn" 
						title={t`Reload`} 
						onClick={() => frameWindow()?.location.reload()}
					>
						⟳
					</button>
					<input
						className="web__address"
						value={address}
						readOnly
						aria-label={t`Page link`}
						onFocus={e => e.currentTarget.select()}
					/>
					<button className="web__btn" title={t`Copy link`} onClick={() => copyText(address)}>
						{t`Copy`}
					</button>
					<button 
						className="web__btn web__close"
						title={t`Close (Esc)`}
						onClick={close}
					>
						✕
					</button>
				</div>
				<div className="web__viewport">
					<div className="web__loader" aria-hidden={loaded}>
						<div className="web__loader-spinner" />
					</div>
					{src && (
						<iframe
							ref={frameRef}
							className="web__frame"
							src={src}
							title="oss! web"
							onLoad={onFrameLoad}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
