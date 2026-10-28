import './Transition.css';

import sleep from '@oss-idle/shared/helpers/sleep';
import Synced from '@oss-idle/shared/helpers/synced';
import useSynced from '@oss-idle/shared/hooks/useSynced';

const FADE_MS = 300;

type Phase = 'in' | 'covered' | 'out';

type TransitionState = {
	/** identifies the active transition so a stale handle can't drive a newer one */
	id: number;
	phase: Phase;
};

const state = new Synced<TransitionState | null>(null);
let counter = 0;

export class Transition {
	/** resolves once the screen is fully covered (fade-in done) */
	readonly covered: Promise<void>;
	private revealing?: Promise<void>;
	private readonly id = ++counter;

	private constructor() {
		void state.set({
			id: this.id, phase: 'in',
		});
		this.covered = sleep(FADE_MS).then(() => {
			if (this.active())
				void state.set({
					id: this.id, phase: 'covered',
				});
		});
	}

	/** Begin a fade to black. Returns a handle the scenes use to drive the rest. */
	static begin(): Transition {
		return new Transition();
	}

	private active(): boolean {
		return state.get()?.id === this.id;
	}

	/**
	 * Fade the cover out and tear it down. Waits for `covered` first, so the cover
	 * is always shown for at least one full fade even when the caller is ready
	 * early. Resolves once the screen is clear; idempotent.
	 */
	async reveal(): Promise<void> {
		return (this.revealing ??= (async () => {
			await this.covered;
			if (!this.active()) return;
			void state.set({
				...state.get()!, phase: 'out',
			});
			await sleep(FADE_MS);
			if (this.active()) void state.set(null);
		})());
	}
}

export default function TransitionOverlay() {
	const [s] = useSynced(state);
	if (!s) return null;
	return (
		<div
			className={`transition transition--${s.phase}`}
			style={{ animationDuration: `${FADE_MS}ms` }}
		/>
	);
}

/** A loading panel: spinner + a title/subtitle. */
export function LoadingPanel({ title, sub }: { title: string; sub?: string }) {
	return (
		<div className="transition__panel">
			<div className="transition__spinner" />
			<div className="transition__title">{title}</div>
			{sub && <div className="transition__sub">{sub}</div>}
		</div>
	);
}
