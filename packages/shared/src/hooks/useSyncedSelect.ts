import {
	useEffect,
	useReducer,
	useRef,
} from 'react';

import type Synced from '../helpers/synced.js';

/** The part of `synced` that `select` picks; re-renders only when that part changes.
 *  `select` returns a value already held (an entry, a string, a cached object), never a fresh one. */
export default function useSyncedSelect<T, R>(synced: Synced<T>, select: (value: T) => R): R {
	const [, refresh] = useReducer((n: number) => n + 1, 0);
	const picked = select(synced.get());
	const latest = useRef({
		select, picked, 
	});
	latest.current = {
		select, picked, 
	};
	useEffect(() => synced.forceSync(value => {
		if (!Object.is(latest.current.select(value), latest.current.picked)) refresh();
	}), [synced]);
	return picked;
}
