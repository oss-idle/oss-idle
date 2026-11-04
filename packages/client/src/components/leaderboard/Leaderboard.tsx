import './Leaderboard.css';

import { Trans } from '@lingui/react/macro';
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';

import useAsync from '@oss-idle/shared/hooks/useAsync';
import useSynced from '@oss-idle/shared/hooks/useSynced';

import { music } from '../../audio/MusicPlayer';
import { uiSound } from '../../audio/uiSounds';
import { scoresVersion } from '../../db/schema/score';
import {
	SCORE_TAB,
	SETTINGS,
} from '../../db/settings';
import Account from '../../online/account';
import Auth from '../../online/auth';
import {
	type BoardRow,
	boardScores,
	boardTab,
} from '../../online/services/scores';
import BeatmapAPI from '../../osu/beatmap/beatmap_api';
import { beatmapsVersion } from '../../osu/beatmap/beatmap_store';
import LeaderboardFilters from './LeaderboardFilters';
import PersonalBest from './PersonalBest';
import ScoreEntry from './ScoreEntry';
import UpdateButton from './UpdateButton';

/** ms between two scores of a new board arriving, one after the other */
const STAGGER = 45;
const NO_ROWS: BoardRow[] = [];

/** Where each of a list's rows is, by element (the same element is the same score). */
const tops = (list: HTMLElement | null) =>
	new Map([...list?.children ?? []].map((el) => [el, (el as HTMLElement).offsetTop]));

/**
 * Score leaderboard for the currently-selected difficulty, by score or by pp. The
 * category is switchable between Local and Mine (from SQLite), Friends, Country (the
 * signed-in player's own country - only offered while signed in) and Global.
 */
export default function Leaderboard() {
	const [beatmap] = useSynced(music.beatmap);
	const [account] = useSynced(Account.character);
	const [user] = useSynced(Auth.user);
	const [category] = useSynced(SETTINGS.leaderboard);
	const [sort] = useSynced(SETTINGS.leaderboardSort);
	const [scoresV] = useSynced(scoresVersion);
	const [library] = useSynced(beatmapsVersion);
	// The board on screen and which map + tab it is. A re-fetch of the same board keeps
	// its rows: only the scores that changed come and go, the rest slide to their place.
	const [board, setBoard] = useState<{ key?: string, scores: BoardRow[] }>({ scores: [] });
	const listRef = useRef<HTMLOListElement>(null);
	const before = useRef<Map<Element, number>>(undefined);

	const country = account?.country;

	const effective = boardTab(category, country, user?.supporter);
	const local = effective === SCORE_TAB.LOCAL || effective === SCORE_TAB.MINE;
	const key = `${beatmap?.metadata.id}:${effective}:${sort}:${country}`;
	const loading = board.key !== key;
	const scores = loading ? NO_ROWS : board.scores;
	const show = (rows: BoardRow[]) => {
		// the same board updated: where its rows are now, for them to glide from
		if (board.key === key) before.current = tops(listRef.current);
		setBoard({
			key, scores: rows,
		});
	};

	// an online board learns whether the stored chart is the server's (osu!'s update button)
	const outdatedKey = useAsync(async () => {
		if (!beatmap || local) return undefined;
		return await BeatmapAPI.isOutdated(beatmap).catch(() => false) ? key : undefined;
	}, [key, library]);

	useEffect(() => {
		if (!beatmap) return;

		const id = beatmap.metadata.id;
		if (id === undefined) {
			show([]);
			return;
		}
		let cancelled = false;

		boardScores(id, effective, sort, country)
			.then((s) => !cancelled && show(s))
			.catch(() => !cancelled && show([]));
		return () => {
			cancelled = true;
		};
	}, [beatmap, effective, sort, country, scoresV, key]);

	// A new board's scores arrive one after the other: each is mounted on its turn, so a
	// map switch renders and lays out one row at a time instead of the whole board at once.
	const [arrived, setArrived] = useState(0);
	const total = useRef(0);
	total.current = scores.length;
	useEffect(() => {
		setArrived(1);
		const timer = setInterval(() => setArrived((n) => Math.min(n + 1, total.current)), STAGGER);
		return () => clearInterval(timer);
	}, [board.key]);
	const rows = scores.slice(0, arrived);

	// osu!'s tick for each score that comes in where it can be seen
	useEffect(() => {
		const list = listRef.current;
		const row = list?.children[arrived - 1] as HTMLElement | undefined;
		if (!list || !row || row.offsetTop > list.scrollTop + list.clientHeight) return;
		uiSound('songselect/leaderboard-score', {
			pitch: 0.98 + Math.random() * 0.04, pan: -0.3, gap: 0, 
		});
	}, [arrived, board.key]);

	// rows that moved (a score came in above them, or left) glide from where they were;
	// only a board updating in place reads the layout, never a map switch
	useLayoutEffect(() => {
		const from = before.current;
		if (!from) return;
		before.current = undefined;
		const now = tops(listRef.current);
		for (const [el, top] of now) {
			const was = from.get(el);
			if (was === undefined || was === top) continue;
			el.animate([{ translate: `0 ${was - top}px` }, { translate: '0 0' }], {
				duration: 400, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
			});
		}
	}, [rows]);

	return (
		<aside className="lb">
			<LeaderboardFilters country={country} supporter={user?.supporter} />

			<div className="lb__body">
				{beatmap === undefined ? (
					<p className="lb__empty">
						<Trans>Select a difficulty to see its scores.</Trans>
					</p>
				) : outdatedKey === key ? (
					<UpdateButton setId={beatmap.set.metadata.id} />
				) : loading ? (
					<p className="lb__empty is-loading">
						<Trans>Loading…</Trans>
					</p>
				) : scores.length === 0 ? (
					<p className="lb__empty">
						<Trans>No scores yet, be the first!</Trans>
					</p>
				) : (
					<ol className="lb__list" ref={listRef}>
						{rows.map(({ score, player }, i) => (
							<ScoreEntry
								key={score.id}
								score={score}
								player={player}
								rank={i + 1}
								previous={scores[i + 1]?.score}
								pp={sort === 'pp'}
							/>
						))}
					</ol>
				)}
			</div>

			<PersonalBest 
				beatmapId={beatmap?.metadata.id} 
				tab={effective}
				sort={sort}
				country={country} 
				board={loading ? undefined : scores}
			/>
		</aside>
	);
}
