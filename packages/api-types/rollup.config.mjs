import { dts } from 'rollup-plugin-dts';

// shared/apiV2.ts and only the declarations it reaches, in one file
export default {
	input: '../shared/src/apiV2.ts',
	output: { file: 'dist/index.d.ts' },
	plugins: [dts({ tsconfig: '../shared/tsconfig.json' })],
};
