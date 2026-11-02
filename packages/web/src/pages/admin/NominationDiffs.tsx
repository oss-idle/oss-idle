import {
	MAP_TAGS,
	type MapTag,
} from '@oss-idle/shared/beatmap';
import { nominatesIn } from '@oss-idle/shared/groups';
import { rulesetOf } from '@oss-idle/shared/rulesets/ids';

import type { Nomination } from '../../api/maps';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { QUEUED_RULESETS } from '../../rulesets';

type Diff = Nomination['diffs'][number];

/** Per-difficulty ranked toggles: the set is scheduled as a whole, but only the
 *  ticked diffs go (or stay) ranked - the rest are invisible to the client.
 *  A difficulty no ruleset here plays can never be ranked. */
export default function NominationDiffs({
	diffs, busy, live, onToggle, onTags,
}: {
	diffs: Diff[];
	busy: boolean;
	live: boolean;
	onToggle: (beatmapId: number, ranked: boolean) => void;
	onTags: (beatmapId: number, tags: MapTag[]) => void;
}) {
	const user = useCurrentUser() ?? undefined;
	const title = (diff: Diff, locked: boolean): string => {
		if (locked) return 'No ruleset here plays this difficulty';
		if (diff.ranked) return 'Ranked — click to unrank this difficulty';
		return 'Unranked — click to include it';
	};

	const toggle = (diff: Diff) => {
		// Unranking a live diff purges every score earned on it - confirm first.
		if (diff.ranked && live && !confirm(
			`Unrank "${diff.version}"? All scores and progression earned on it will be permanently deleted.`,
		)) return;
		onToggle(diff.id, !diff.ranked);
	};

	const toggleTag = (diff: Diff, tag: MapTag) => onTags(
		diff.id,
		diff.tags.includes(tag) ? diff.tags.filter(t => t !== tag) : [...diff.tags, tag],
	);

	const hint = (diff: Diff, tag: MapTag): string => {
		if (tag === 'ln') return ` (${diff.objects ? Math.round(diff.ln / diff.objects * 100) : 0}%)`;
		// null until the boot backfill reaches it
		return diff.svPoints === null ? '' : ` (${diff.svPoints} sv, ${diff.bpmPoints} bpm)`;
	};

	return (
		<div className='nomination__diffs'>
			{diffs.map(diff => {
				const ruleset = rulesetOf(diff.mode, diff.keys);
				const locked = !ruleset || !QUEUED_RULESETS.includes(ruleset);
				// another ruleset's difficulty is that ruleset's nominators'
				const theirs = !!ruleset && nominatesIn(user, ruleset);
				return (
					<span key={diff.id} className={`nomination__diff-group ${diff.ranked ? 'is-ranked' : ''}`}>
						<button
							className={`nomination__diff ${diff.ranked ? 'is-ranked' : ''} ${locked ? 'is-locked' : ''}`}
							disabled={busy || !theirs || (locked && !diff.ranked)}
							title={title(diff, locked)}
							onClick={() => toggle(diff)}
						>
							<span className='nomination__diff-sr'>{Number(diff.sr).toFixed(2)}☆</span>
							{locked && <span className='nomination__diff-keys'>{diff.keys}K</span>}
							<span className='nomination__diff-name'>{diff.version}</span>
						</button>
						{MAP_TAGS.map(tag => (
							<button
								key={tag}
								className={`nomination__diff-tag ${diff.tags.includes(tag) ? 'is-on' : ''}`}
								disabled={busy || !theirs}
								onClick={() => toggleTag(diff, tag)}
							>
								{tag.toUpperCase()}{hint(diff, tag)}
							</button>
						))}
					</span>
				);
			})}
		</div>
	);
}
