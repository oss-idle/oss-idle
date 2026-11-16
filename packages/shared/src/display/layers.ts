/** Colours cycle past the fourth layer. */
const LAYERS = 4;

/** How many times slot `i` of a `size`-slot track has been filled over: the
 *  track wraps like a boss hp bar, each lap starting a new layer from the left. */
export const layerOf = (i: number, filled: number, size: number) =>
	filled > i ? Math.floor((filled - 1 - i) / size) + 1 : 0;

export const layerClass = (layer: number) =>
	layer > 0 ? `is-layer-${(layer - 1) % LAYERS + 1}` : '';
