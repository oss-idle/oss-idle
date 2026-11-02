import {
	ph,
	plural,
} from '@lingui/core/macro';
import {
	Trans,
	useLingui,
} from '@lingui/react/macro';
import {
	useRef,
	useState,
} from 'react';

import type { BpmGuess } from './bpmDetect';
import { detectSongBpm } from './detectSongBpm';
import type EditorSession from './session';

/** Taps this far apart start the count again. */
const TAP_GAP_MS = 2000;
/** Taps before the tapped tempo can be used, as Quaver's calculator. */
const TAPS_NEEDED = 8;

type Taps = { first: number, last: number, count: number, songTime: number };

/**
 * Finding the tempo: guessed from the song (its BPM, how sure, where the first beat is), or
 * tapped along to it. Either goes in as a BPM point.
 */
export default function EditorBpmTools({ session }: { session: EditorSession }) {
	const { t } = useLingui();
	const [guess, setGuess] = useState<BpmGuess | 'detecting' | 'none'>();
	const [taps, setTaps] = useState<Taps>();
	const latest = useRef(taps);
	latest.current = taps;

	const detect = async () => {
		if (!session.song) return setGuess('none');
		setGuess('detecting');
		setGuess(await detectSongBpm(session.song) ?? 'none');
	};
	const tap = () => {
		const now = performance.now();
		const was = latest.current;
		setTaps(!was || now - was.last > TAP_GAP_MS
			? {
				first: now, last: now, count: 1, songTime: session.now(),
			}
			: {
				...was, last: now, count: was.count + 1,
			});
	};
	const tapped = taps && taps.count > 1
		? 60000 * (taps.count - 1) / (taps.last - taps.first) : undefined;
	const confidence = typeof guess === 'object' ? Math.round(guess.confidence * 100) : 0;

	return (
		<div className='editor__stat editor__bpm-tools'>
			<span className='ladder-sum__label'><Trans>Find the tempo</Trans></span>
			<span className='editor__divisors'>
				<button onClick={() => void detect()} disabled={guess === 'detecting'}>
					{guess === 'detecting' ? <Trans>Listening…</Trans> : <Trans>Detect BPM</Trans>}
				</button>
				<button onMouseDown={tap}><Trans>Tap</Trans></button>
			</span>
			{guess === 'none' && <span className='editor__hint'><Trans>No tempo found</Trans></span>}
			{typeof guess === 'object' && (
				<>
					<span className='editor__hint'>
						{t`Found ${ph({ bpm: guess.bpm })} BPM, ${ph({ confidence })}% sure`}
					</span>
					<span className='editor__divisors'>
						<button onClick={() => session.setTempoAt(guess.offset, 60000 / guess.bpm)}>
							{t`Add at ${ph({ offset: guess.offset })} ms`}
						</button>
						<button onClick={() => session.setTempoAt(session.now(), 60000 / guess.bpm)}>
							<Trans>Add at the current time</Trans>
						</button>
					</span>
				</>
			)}
			{tapped !== undefined && (
				<>
					<span className='editor__hint'>
						{t`Tapped ${ph({ bpm: Math.round(tapped) })} BPM over ${plural(ph({ count: taps!.count }), {
							one: '# tap', other: '# taps', 
						})}`}
					</span>
					{taps!.count >= TAPS_NEEDED && (
						<span className='editor__divisors'>
							<button onClick={() => session.setTempo(taps!.songTime, 60000 / Math.round(tapped))}>
								<Trans>Use it</Trans>
							</button>
						</span>
					)}
				</>
			)}
		</div>
	);
}
