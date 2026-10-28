import { CharacterDTO } from '@oss-idle/shared/character';
import {
	mapped,
	ValueIn,
} from '@oss-idle/shared/helpers/mapped';
import Synced from '@oss-idle/shared/helpers/synced';
import { Skills } from '@oss-idle/shared/rulesets/mania/4k/skills';
import SkillState from '@oss-idle/shared/rulesets/skillState';
import { maxUpgrades } from '@oss-idle/shared/upgrades';
import {
	xpGivesLevel,
	xpToLevel,
} from '@oss-idle/shared/xp';

import {
	selectedDefLoaded,
	selectedRuleset,
} from '../../rulesets/registry';
import {
	DAO,
	DB,
	Insert,
	integer,
	table,
	text,
} from '../dao';
import {
	type Progress,
	progressColumns,
	RULESET_PROGRESS,
} from './character_ruleset';


export const STATUS = mapped(['IDLE']);
export type CharacterStatus = ValueIn<typeof STATUS>;

const t = table('character', {
	id:          integer().primaryKey().autoincrement(),
	name:        text(),
	// 4K's progress, from before rulesets: every other ruleset has its own table
	...progressColumns(Skills),
	overallTotalXp: integer().default(0),
	overallLevel:   integer().default(0),
	generation:  integer().default(1),
	// when memory was last prestiged: plays before it no longer train it
	memoryResetAt: integer().default(0),
	// JSON list of when memory upgrades were bought: each forgets plays on every map
	memoryForgetAt: text().default('[]'),
	local:       integer().default(0),
	current:     integer().default(0),
});

export type CharacterData = Insert<typeof t.columns>;

export default class Character extends DAO(t) {

	/** The picked ruleset's skills (none while it loads, on the boot's placeholder). */
	public readonly skills = (selectedDefLoaded()?.skills ?? []).map(name => new SkillState(name));
	public readonly status = new Synced<CharacterStatus>(STATUS.IDLE);
	/** The picked ruleset's progress: this row for 4K, the ruleset's own row otherwise. */
	public progress: Progress = this;

	constructor(row: CharacterData) {
		super(row);
		this.readSkills();
	}

	private readSkills(): void {
		const columns = this.skillColumns();
		this.skills.forEach(skill => {
			void skill.level.set(columns[skill.name] ?? 0);
			void skill.xp.set(columns[`${skill.name}XP`] ?? 0);
			void skill.upgrades.set(columns[`${skill.name}Upgrades`] ?? 0);
			void skill.overdrive.set(columns[`${skill.name}Overdrive`] ?? 0);
			void skill.prestige.set(columns[`${skill.name}Prestige`] ?? 0);
			void skill.lifetimeXp.set(columns[`${skill.name}LifetimeXp`] ?? 0);
		});
	}

	/** Read the picked ruleset's progress off its own table, made on first use. */
	private async readProgress(): Promise<void> {
		const Progress = RULESET_PROGRESS[selectedRuleset.get()];
		if (!Progress) return;
		this.progress = await Progress.get(this.id) ?? await new Progress({ characterId: this.id }).add();
		this.readSkills();
	}

	public async persistSkills(): Promise<void> {
		const columns = this.skillColumns();
		for (const skill of this.skills) {
			columns[skill.name] = skill.level.get();
			columns[`${skill.name}XP`] = skill.xp.get();
			columns[`${skill.name}Upgrades`] = skill.upgrades.get();
			columns[`${skill.name}Overdrive`] = skill.overdrive.get();
			columns[`${skill.name}Prestige`] = skill.prestige.get();
		}
		await this.progress.update();
	}

	/** Book a finished guest play's xp into the totals the overall level - and so
	 *  the rebirth requirement - is derived from. Prestige never takes these back. */
	public async addProgression(gains: readonly { skill: string, gained: number }[]): Promise<void> {
		const columns = this.skillColumns();
		let overall = 0;
		for (const g of gains) {
			const gained = Math.round(g.gained);
			columns[`${g.skill}TotalXp`] += gained;
			columns[`${g.skill}LifetimeXp`] += gained;
			overall += gained;
		}
		this.progress.overallTotalXp += overall;
		this.progress.overallLevel = xpGivesLevel(this.progress.overallTotalXp).level;
		await this.persistSkills();
	}

	/** Spend a purchase's XP out of the lifetime totals, like the server route
	 *  does, so buying upgrades costs a guest the same overall levels. */
	public async spendXP(skill: string, spent: number): Promise<void> {
		const amount = Math.round(spent);
		const columns = this.skillColumns();
		columns[`${skill}TotalXp`] = Math.max(0, columns[`${skill}TotalXp`] - amount);
		this.progress.overallTotalXp = Math.max(0, this.progress.overallTotalXp - amount);
		this.progress.overallLevel = xpGivesLevel(this.progress.overallTotalXp).level;
		await this.persistSkills();
	}

	/** Debug mode: put skills at these real levels as if earned - their total xp
	 *  the level's price, which is what {@link relevel} reads back - and at these
	 *  prestiges, the upgrades held to the slots left. */
	public async setLevels(
		levels: Partial<Record<string, number>>,
		prestige: Partial<Record<string, number>> = {},
	): Promise<void> {
		const columns = this.skillColumns();
		for (const skill of this.skills) {
			const count = prestige[skill.name];
			if (count !== undefined) {
				skill.prestige.set(count);
				skill.upgrades.set(Math.min(skill.upgrades.get(), maxUpgrades(count)));
			}
			const level = levels[skill.name];
			if (level === undefined) continue;
			const totalXp = Math.ceil(xpToLevel(level));
			this.progress.overallTotalXp = Math.max(
				0, this.progress.overallTotalXp + totalXp - (columns[`${skill.name}TotalXp`] ?? 0),
			);
			columns[`${skill.name}TotalXp`] = totalXp;
			// the level is the level: the sim plays it, not what the lifetime bought
			columns[`${skill.name}LifetimeXp`] = totalXp;
			skill.lifetimeXp.set(totalXp);
			skill.level.set(level);
			skill.xp.set(0);
		}
		this.progress.overallLevel = xpGivesLevel(this.progress.overallTotalXp).level;
		await this.persistSkills();
	}

	/** The picked ruleset's skill columns by name. */
	private skillColumns(): Record<string, number> {
		return this.progress as unknown as Record<string, number>;
	}

	/** Everything a skill has ever earned, prestige or not. */
	public lifetimeXp(skill: string): number {
		return this.skillColumns()[`${skill}LifetimeXp`] ?? 0;
	}

	public memoryForgets(): number[] {
		return JSON.parse(this.progress.memoryForgetAt) as number[];
	}

	/** Read the levels back off the XP the character has kept.
	 *
	 *  The curve's prices are tuned between releases; the XP spent against them
	 *  never changes, so the levels are derived again rather than migrated once.
	 *  Only the local lineage is reprocessed here - a server character's levels
	 *  are its server's to say. */
	public async relevel(): Promise<void> {
		if (!this.isGuest()) return;

		let moved = false;
		const columns = this.skillColumns();
		for (const skill of this.skills) {
			const next = xpGivesLevel(columns[`${skill.name}TotalXp`] ?? 0);
			const xp = Math.round(next.xp);
			if (next.level === skill.level.get() && xp === skill.xp.get()) continue;
			skill.level.set(next.level);
			skill.xp.set(xp);
			moved = true;
		}

		const overall = xpGivesLevel(this.progress.overallTotalXp).level;
		if (overall !== this.progress.overallLevel) {
			this.progress.overallLevel = overall;
			moved = true;
		}

		if (moved) await this.persistSkills();
	}

	/** Make this the local character `guest()` returns, across reloads. */
	public async makeCurrent(): Promise<void> {
		await DB.run('UPDATE character SET current = 0 WHERE local = 1');
		this.current = 1;
		await this.update();
	}

	public static async newCharacter(name?: string, generation = 1): Promise<Character> {
		name = name ?? 'Guest';
		const character = await new Character({
			id: await Character.nextLocalId(),
			name,
			generation,
			local: 1,
		}).add();
		await character.makeCurrent();
		await character.readProgress();
		return character;
	}

	/** Local characters live below zero: the table also caches server characters
	 *  by their own id, and the two id spaces must never meet. */
	private static async nextLocalId(): Promise<number> {
		return await DB.read(db => {
			const res = db.exec('SELECT COALESCE(MIN(id), 0) - 1 AS id FROM character WHERE id < 0');
			return (res[0]?.values[0][0] as number) ?? -1;
		});
	}

	/** The live offline character: whichever local one was last played, else the
	 *  newest generation. None until the player has chosen to play locally. */
	public static async localCurrent(): Promise<Character | undefined> {
		const current = await Character.first(
			'SELECT * FROM character WHERE local = 1 ORDER BY current DESC, generation DESC LIMIT 1',
		);
		if (!current) return undefined;
		await current.readProgress();
		await current.relevel();
		return current;
	}

	public static async guest(): Promise<Character> {
		return await Character.localCurrent() ?? await Character.newCharacter();
	}

	/** Whether an id belongs to the local lineage rather than a server character. */
	public static isLocalId(id: number): boolean {
		return id < 0;
	}

	public static async locals(): Promise<Character[]> {
		const locals = await Character.query(
			'SELECT * FROM character WHERE local = 1 ORDER BY generation',
		);
		for (const character of locals) await character.relevel();
		return locals;
	}
	
	static fromDTO(dto: CharacterDTO): Character {
		const { skills, ...rest } = dto;
		const skillData = Object.fromEntries(
			Object.entries(skills).flatMap(([name, {
				level, xp, upgrades, overdrive, prestige, lifetimeXp,
			}]) => [
				[name, level],
				[`${name}XP`, xp],
				[`${name}Upgrades`, upgrades],
				[`${name}Overdrive`, overdrive],
				[`${name}Prestige`, prestige],
				[`${name}LifetimeXp`, lifetimeXp],
			]),
		);
		const Progress = RULESET_PROGRESS[dto.ruleset];
		const character = new Character({
			...rest, ...Progress ? {} : skillData, local: 0,
		});
		if (Progress) {
			character.progress = new Progress({
				characterId: dto.id, ...skillData, overallLevel: dto.overallLevel,
			});
			character.readSkills();
		}
		return character;
	}

	public isGuest(): boolean {
		return this.local === 1;
	}
}