import Synced from '../helpers/synced.js';
import {
	skillXPMultiplier,
	type UpgradeState,
} from '../upgrades.js';
import {
	effectiveLevelOf,
	playLevelOf,
	xpForLevel,
} from '../xp.js';

/** A skill's progression on a character - level, xp, gear and prestige - whatever the
 *  ruleset does with it in a play. */
export default class SkillState<S extends string = string> {

	public readonly level = new Synced(0);
	public readonly xp = new Synced(0);
	public readonly upgrades = new Synced(0);
	public readonly overdrive = new Synced(0);
	public readonly prestige = new Synced(0);
	/** Everything the skill ever earned, prestige or not: what it plays at follows it. */
	public readonly lifetimeXp = new Synced(0);

	constructor(
		public readonly name: S,
		def: number = 0,
	) {
		if (def !== 0) this.level.set(def);
	}

	public static xpForLevel(level: number): number {
		return xpForLevel(level);
	}

	public xpMultiplier(): number {
		return skillXPMultiplier(
			this.upgrades.get(),
			this.overdrive.get(),
			this.prestige.get(),
		);
	}

	/** The progress the upgrade and prestige math reads. */
	public state(): UpgradeState {
		return {
			level: this.level.get(),
			xp: this.xp.get(),
			upgrades: this.upgrades.get(),
			overdrive: this.overdrive.get(),
			prestige: this.prestige.get(),
		};
	}

	/** Write back what that math returned. */
	public apply(next: UpgradeState): void {
		void this.level.set(next.level);
		void this.xp.set(next.xp);
		void this.upgrades.set(next.upgrades);
		void this.overdrive.set(next.overdrive);
		void this.prestige.set(next.prestige);
	}

	/** Effective level: what the player earned, how far into the next level they
	 *  are, and what prestige granted. The same number the player is shown. */
	public effectiveLevel(): number {
		return effectiveLevelOf(this.level.get(), this.xp.get(), this.prestige.get());
	}

	/** The level the skill plays at in the sim: see {@link playLevelOf}. */
	public playLevel(): number {
		return playLevelOf(this.level.get(), this.xp.get(), this.lifetimeXp.get(), this.prestige.get());
	}

	/** Take on `from`'s whole progression. */
	public copy(from: SkillState): void {
		this.apply(from.state());
		void this.lifetimeXp.set(from.lifetimeXp.get());
	}

	gainXP(xp: number): number {
		this.lifetimeXp.set(this.lifetimeXp.get() + xp);
		this.xp.set(this.xp.get() + xp);
		let levelsGained = 0;
		do {
			const xpNeeded = SkillState.xpForLevel(this.level.get());
			if (this.xp.get() > xpNeeded) {
				this.xp.set(this.xp.get() - xpNeeded);
				this.level.set(this.level.get() + 1);
				levelsGained++;
			} else {
				break;
			}
		} while(true);

		return levelsGained;
	}
}
