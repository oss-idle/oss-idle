import type { SkinSource } from './OsuSkin';

/** An element's name without its @2x, frame number or extension: `mania-note1T-0@2x.png`
 *  is `mania-note1T`. */
const element = (path: string) =>
	path.replace(/\.[^./]+$/, '').replace(/@2x$/, '').replace(/-\d+$/, '');

/** `top`'s files over `base`, element by element: an element `top` has hides every variant
 *  of it `base` has, as a map's skin covers the player's in osu!stable. */
export const layered = (top: SkinSource, base: SkinSource): SkinSource => {
	const own = new Set(top.paths);
	const elements = new Set(top.paths.map(element));
	return {
		paths: [...top.paths, ...base.paths.filter(path => !elements.has(element(path)))],
		read: path => (own.has(path) ? top.read(path) : base.read(path)),
		map: own,
	};
};
