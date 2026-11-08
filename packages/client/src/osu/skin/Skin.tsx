import { type Grade } from '@oss-idle/shared/grade';
import Log from '@oss-idle/shared/helpers/log';
import Synced from '@oss-idle/shared/helpers/synced';
import { findImage } from '@oss-idle/shared/osuSkin/files';
import type { IdleIni } from '@oss-idle/shared/osuSkin/idleIni';
import {
	type Judgement,
	Judgements,
} from '@oss-idle/shared/rulesets/mania/judgement';
import { ColorSchema } from '@oss-idle/shared/types/color';

import { SkinDAO } from '../../db/schema/skin';
import { SETTINGS } from '../../db/settings';
import {
	BUILTIN,
	OWN_GRADES,
	RANKING_IMAGES,
} from './builtin';
import { defaultSource } from './defaultSkin';
import {
	HIT_COMMANDS,
	loadManiaAssets,
	type ManiaAssets,
} from './maniaAssets';
import OsuSkin from './OsuSkin';
import SkinGrade from './SkinGrade';
import { downloadSkin } from './skinInstall';
import { installedSource } from './sources';

let defaultSkin: Promise<OsuSkin> | undefined;
/** oss!idle's own skin, which fills in whatever a player's skin lacks. */
export const loadDefaultSkin = () => defaultSkin ??= OsuSkin.load(defaultSource());

/** The judgements' colours and names: the skin's idle.ini, else the default skin's. */
const judgementStyles = (own: IdleIni, fallback: IdleIni) =>
	Object.fromEntries(Judgements.map(j => judgementStyle(j, own, fallback))) as
		typeof BUILTIN.judgements;

const judgementStyle = (j: Judgement, own: IdleIni, fallback: IdleIni) => {
	const colour = own.judgements[j] ?? fallback.judgements[j];
	const style = BUILTIN.judgements[j];
	const c = colour
		? ColorSchema.parse(`rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${colour[3] / 255})`)
		: style.judge;
	return [j, {
		text: own.judgementNames[j] ?? fallback.judgementNames[j] ?? style.text,
		judge: c, hitErrorBg: c, hitErrorTick: c, devianceGraphBg: c, devianceGraphTick: c,
	}];
};

/** A sound's URL from the skin, else the default skin. */
const soundUrl = async (osu: OsuSkin, fallback: OsuSkin, name: string) => {
	for (const skin of osu === fallback ? [osu] : [osu, fallback]) {
		const found = skin.sound(name);
		if (found) return skin.url(found);
	}
	return undefined;
};

/** An image's URL from the skin, else the default skin; trimmed to what it shows when asked. */
const imageUrl = async (osu: OsuSkin, fallback: OsuSkin, names: string[], trimmed = false) => {
	for (const skin of [osu, fallback]) {
		for (const name of names) {
			const found = findImage(skin, name);
			if (found) return trimmed ? skin.trimmedUrl(found.path) : skin.url(found.path);
		}
	}
};

/**
 * The skin the game plays with: an osu! skin, and our default skin behind it. Its mania
 * assets decode per key count on first use and stay until the skin is let go.
 */
export default class Skin {

	private static next = 0;

	/** tells this skin's decoded sounds apart from the previous skin's */
	readonly id = `skin${Skin.next++}`;
	private readonly mania = new Map<number, Promise<ManiaAssets>>();
	private readonly ready = new Map<number, ManiaAssets>();

	private constructor(
		readonly osu: OsuSkin | undefined,
		readonly fallback: OsuSkin | undefined,
		readonly data: Omit<typeof BUILTIN, 'judgements'> & {
			judgements: typeof BUILTIN.judgements,
			menu: { background?: string, seeya?: string },
		},
	) {}

	/** The game's look while no skin has loaded yet. */
	static empty(): Skin {
		return new Skin(undefined, undefined, {
			...BUILTIN, menu: {},
		});
	}

	/** `osu` played with the default skin behind it; the default skin alone when omitted.
	 *  A preview leaves out what only the menu shows, so a catalog skin downloads less. */
	static async create(osu?: OsuSkin, preview = false): Promise<Skin> {
		const fallback = await loadDefaultSkin();
		const own = osu ?? fallback;
		const background = osu && !preview ? await imageUrl(osu, osu, ['menu-background']) : undefined;
		const seeya = preview ? undefined : await soundUrl(own, fallback, 'seeya');
		return new Skin(own, fallback, {
			...BUILTIN,
			judgements: judgementStyles(own.idle, fallback.idle),
			menu: {
				...(background ? { background } : {}), ...(seeya ? { seeya } : {}), 
			},
		});
	}

	private readonly images = new Map<string, Promise<string>>();
	private readonly imagesReady = new Map<string, string>();

	/** The first of `names` the skin (else the default skin) has, read and trimmed the first
	 *  time something shows it; `none` when neither has one. */
	private image(key: string, names: string[], none = ''): Promise<string> {
		let url = this.images.get(key);
		if (!url) {
			url = (this.osu && this.fallback && names.length
				? imageUrl(this.osu, this.fallback, names, true)
				: Promise.resolve(undefined))
				.then(found => found ?? none);
			this.images.set(key, url);
			void url.then(u => this.imagesReady.set(key, u));
		}
		return url;
	}

	/** {@link image}, when it has already been read. */
	imageNow(key: string): string | undefined {
		return this.imagesReady.get(key);
	}

	/** A grade's image: the small one (ranking-X-small) everywhere but the results screen,
	 *  which shows the large one. */
	gradeUrl(grade: Grade, large = false): Promise<string> {
		const image = RANKING_IMAGES[grade];
		const names = !image ? [] : large ? [image] : [`${image}-small`, image];
		return this.image(gradeKey(grade, large), names, OWN_GRADES[grade] ?? '');
	}

	/** A judgement's hit image, for the results screen: the skin's own file by its osu! name,
	 *  as stable's ranking screen takes it even when skin.ini points elsewhere. */
	judgementUrl(judgement: Judgement): Promise<string> {
		const name = HIT_COMMANDS[judgement][1];
		return this.image(judgementKey(judgement), [`${name}-0`, name]);
	}

	/** What the playfield draws `keys` keys with, once decoded; starts decoding it if not. */
	maniaAssets(keys: number): ManiaAssets | undefined {
		const ready = this.ready.get(keys);
		if (!ready) void this.prepare(keys);
		return ready;
	}

	prepare(keys: number): Promise<ManiaAssets | undefined> {
		if (!this.osu || !this.fallback) return Promise.resolve(undefined);
		let assets = this.mania.get(keys);
		if (!assets) {
			assets = loadManiaAssets(this.osu, this.fallback, keys);
			this.mania.set(keys, assets);
			void assets.then(
				a => this.ready.set(keys, a),
				e => Log.errorPopup(`Failed to load skin: ${String(e)}`),
			);
		}
		return assets;
	}

	/** Let go of everything decoded, but the default skin's (shared by every skin). */
	dispose(): void {
		if (this.osu && this.osu !== this.fallback) this.osu.dispose();
	}

	/** A grade badge: the skin's small image (ranking-X-small) as stable shows grades
	 *  everywhere but the results screen, which asks for the large one. */
	public grade(grade: Grade, className: string = '', large = false): JSX.Element {
		return <SkinGrade skin={this} grade={grade} className={className} large={large} />;
	}

}

export const gradeKey = (grade: Grade, large: boolean) => `grade:${grade}${large ? ':large' : ''}`;
export const judgementKey = (judgement: Judgement) => `hit:${judgement}`;

export const currentSkinDAO = new Synced<SkinDAO | undefined>(undefined);
export const currentSkin = new Synced(Skin.empty());

/** The skin a row plays: its installed files (a catalog skin's downloaded again when the
 *  browser lost them), else the default skin. */
export const skinOf = async (dao: SkinDAO | undefined): Promise<Skin> => {
	let source = dao && await installedSource(dao.id);
	if (dao && !source && !dao.local) {
		source = await downloadSkin(dao.id).then(() => installedSource(dao.id), () => undefined);
	}
	return Skin.create(source && await OsuSkin.load(source));
};

let loading = 0;
void currentSkinDAO.sync(async current => {
	const mine = ++loading;
	let skin: Skin;
	try {
		skin = await skinOf(current);
	} catch (e) {
		Log.errorPopup(`Failed to load skin: ${String(e)}`);
		skin = await Skin.create();
	}
	if (mine !== loading) return skin.dispose();
	// the usual key count, ready before the first play
	await skin.prepare(4);
	if (mine !== loading) return skin.dispose();
	const previous = currentSkin.get();
	currentSkin.set(skin);
	if (previous !== currentEditorSkin.get()) previous.dispose();
});

/** The skin the editor draws its notes with: the gameplay skin itself when they are one. */
export const currentEditorSkin = new Synced(Skin.empty());

let editorLoading = 0;
/** the id the editor's own skin (not the gameplay one) was loaded for */
let ownEditor: number | undefined;
const loadEditorSkin = async () => {
	const id = SETTINGS.editorSkin.get();
	const separate = id !== (currentSkinDAO.get()?.id ?? 0);
	// another gameplay skin leaves the editor's own as it is
	if (separate && ownEditor === id) return;
	const mine = ++editorLoading;
	let skin = currentSkin.get();
	if (separate) {
		const dao = id ? await SkinDAO.get(id) : undefined;
		skin = await skinOf(dao).catch(() => Skin.create());
	}
	if (mine !== editorLoading) {
		if (skin !== currentSkin.get()) skin.dispose();
		return;
	}
	ownEditor = separate ? id : undefined;
	const previous = currentEditorSkin.get();
	currentEditorSkin.set(skin);
	if (previous !== skin && previous !== currentSkin.get()) previous.dispose();
};
void SETTINGS.editorSkin.sync(loadEditorSkin);

/** Load the skin `id` again from its files, wherever it is in use. */
export const reloadSkin = (id: number) => {
	const current = currentSkinDAO.get();
	if (current?.id === id) currentSkinDAO.set(current);
	else if (ownEditor === id) {
		ownEditor = undefined;
		void loadEditorSkin();
	}
};
void currentSkin.sync(loadEditorSkin);

void SkinDAO.getEnabled().then(current => {
	if (current) currentSkinDAO.set(current);
});
