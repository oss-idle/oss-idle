import { env } from '../env';

/**
 * Pull a set's `.osz` from the configured mirror (`BEATMAP_MIRROR_URL`), so an
 * accepted request can go straight into {@link ingestOsz} without anyone
 * downloading and re-uploading the file by hand. osu! itself has no download
 * endpoint an app token may use, hence the mirror.
 */

const MAX_BYTES = 128 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

export const downloadOsz = async (setId: number): Promise<Buffer> => {
	const url = env.BEATMAP_MIRROR_URL.replace('{setId}', String(setId));

	const res = await fetch(url, {
		redirect: 'follow',
		headers: { 'User-Agent': 'oss-idle/1.0' },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	}).catch((e: Error) => {
		throw new Error(`Mirror unreachable: ${e.message}`);
	});

	if (!res.ok) throw new Error(`Mirror returned ${res.status} for set ${setId}`);

	// `terminated`: the mirror closed the connection before the end of the file
	const body = await res.arrayBuffer().catch(() => {
		throw new Error('The mirror cut the download short - try again, or download the .osz yourself and upload it here');
	});
	const buffer = Buffer.from(body);
	if (buffer.length > MAX_BYTES) throw new Error('Downloaded file is too large');
	// A mirror that 200s an HTML error page would otherwise reach the parser.
	if (buffer.subarray(0, 2).toString() !== 'PK') {
		throw new Error('Mirror did not return a .osz archive');
	}
	return buffer;
};
