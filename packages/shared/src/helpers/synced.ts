/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	useEffect,
	useState,
} from 'react';

import { Big } from '../big.js';
import Listener from './listener.js';
import Log from './log.js';

type SyncedCallback<T> = (value: T, previous?: T) => unknown | Promise<void>;
type ForceSyncedCallback<T> = (value: T, previous?: T) => unknown;
type SyncedValues<T extends readonly Synced<any>[]> = { 
	[K in keyof T]: T[K] extends { get(): infer V } ? V : never 
};

export default class Synced<T> {

	protected previous?: T;
	protected readonly listener = new Listener<SyncedCallback<T>>();

	constructor(
		protected current: T,
	) {}

	/** Calls `callback` now and on every change; resolves to what stops it. */
	async sync(callback: SyncedCallback<T>): Promise<() => void> {
		const stop = this.listener.on(callback);

		try {
			await callback(this.current, this.previous);
		} catch (e) {
			Log.errorPopup(String(e));
		}
		return stop;
	}

	/** {@link sync} without waiting on `callback`; returns what stops it. */
	forceSync(callback: ForceSyncedCallback<T>): () => void {
		const stop = this.listener.on(callback);
		
		try {
			callback(this.current, this.previous);
		} catch (e) {
			Log.errorPopup(String(e));
		}
		return stop;
	}
	
	public desync(callback: SyncedCallback<T>): void {
		this.listener.off(callback);
	}

	/**
	 * React hook: subscribes to this value and maps it through `mapper`, re-running
	 * whenever the synced value changes. The mapper may be async; stale results are
	 * dropped so out-of-order resolutions can't clobber a newer value. Returns
	 * `undefined` until the first mapped result lands.
	 */
	public use<R>(
		mapper: (value: T, previous?: T) => R | Promise<R>,
	): R | undefined {
		const [mapped, setMapped] = useState<R>();
		useEffect(() => {
			let token = 0;
			const run = (value: T, previous?: T) => {
				const id = ++token;
				void (async () => {
					const result = await mapper(value, previous);
					if (id === token) setMapped(result);
				})();
			};
			// sync() both subscribes and fires once with the current value
			this.sync(run);
			return () => {
				token = -1; // invalidate any in-flight mapping
				this.desync(run);
			};
		}, [this]);
		return mapped;
	}

	static async all<const T extends Synced<any>[]>(
		synced: [...T],
		callback: (
			values: SyncedValues<T>, 
			previous: SyncedValues<T>
		) => unknown | Promise<void>,
	) {
		let previous = synced.map(() => undefined) as SyncedValues<T>;
		const getValues = () => synced.map(b => b.get()) as SyncedValues<T>;
		const trigger = async () => {
			const current = getValues();
			try {
				await callback(current, previous);
			} catch (e) {
				Log.errorPopup(String(e));
			}
			previous = current;
		};

		let initialized = false;
		synced.forEach(synced => {
			synced.sync(() => {
				if (!initialized) return;
				trigger();
			});
		});
		initialized = true;

		await trigger();
	}

	public async set(value: T): Promise<void> {
		if (typeof value !== 'object' && value === this.current) return;
		if (value instanceof Big && this.current instanceof Big && value.eq(this.current)) return;
		this.previous = this.current;
		this.current = value;
		return this.listener.trigger(this.current, this.previous);
	}

	public get() {
		return this.current;
	}

}