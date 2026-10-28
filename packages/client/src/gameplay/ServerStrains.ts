import type { StrainSamples } from '@oss-idle/shared/play';

/** A server play's strain gauges, from the samples streamed with its replay. */
export default class ServerStrains {
	private from = 0;
	private every = 1;
	private skills: readonly string[] = [];
	private readonly values: number[][] = [];
	/** reused every frame: the gauges are read at frame rate */
	private readonly out: Record<string, number> = {};
	revision = 0;

	add(samples?: StrainSamples): void {
		if (!samples) return;
		if (!this.skills.length) {
			this.from = samples.from;
			this.every = samples.every;
			this.skills = samples.skills;
		}
		const at = Math.round((samples.from - this.from) / this.every);
		for (let k = 0; k < samples.values.length; k++) this.values[at + k] = samples.values[k];
		this.revision++;
	}

	/** The gauges at song time `now`: the last sample at or before it. */
	strainsAt(now: number): Readonly<Record<string, number>> {
		const k = Math.min(this.values.length - 1, Math.floor((now - this.from) / this.every));
		const row = k >= 0 ? this.values[k] : undefined;
		for (let i = 0; i < this.skills.length; i++) this.out[this.skills[i]] = (row?.[i] ?? 0) / 100;
		return this.out;
	}
}
