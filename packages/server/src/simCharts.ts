import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The sim service's charts (simService.ts): each version of a map it was sent, kept as
 * `<checksum>.osu`, so a sim API request names its chart by checksum and the text crosses
 * the network only when the service has never had that version. In systemd's
 * StateDirectory, so a restart keeps them (SIM_CHARTS_DIR elsewhere).
 */
const DIR = process.env.SIM_CHARTS_DIR
	?? process.env.STATE_DIRECTORY
	?? join(tmpdir(), 'oss-idle-sim-charts');

/** A `beatmaps.checksum`: lowercase hex sha256 (and so a safe file name). */
export const isChecksum = (value: unknown): value is string =>
	typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/** `beatmaps.checksum` of a chart: the sha256 of its text without the leading BOMs, as
 *  the database generates it. */
export const checksumOf = (chart: string): string =>
	createHash('sha256').update(chart.replace(/^﻿+/, '')).digest('hex');

const fileOf = (checksum: string) => join(DIR, `${checksum}.osu`);

export const hasChart = (checksum: string): boolean => existsSync(fileOf(checksum));

/** Keep a chart under its checksum (written aside, then moved in: a thread reading it
 *  never sees half a file). */
export const keepChart = (checksum: string, chart: string): void => {
	mkdirSync(DIR, { recursive: true });
	const aside = `${fileOf(checksum)}.${process.pid}.${Date.now()}`;
	writeFileSync(aside, chart);
	renameSync(aside, fileOf(checksum));
};

export const readChart = (checksum: string): string => readFileSync(fileOf(checksum), 'utf8');
