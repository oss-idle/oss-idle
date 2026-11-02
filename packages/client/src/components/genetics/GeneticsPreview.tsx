import { Trans } from '@lingui/react/macro';
import { useRef } from 'react';

import {
	type GeneticsDef,
	NO_GENETICS,
} from '@oss-idle/shared/genetics';

import { uiSound } from '../../audio/uiSounds';
import { LAYER } from '../../input/keyboardOwner';
import { selectedDef } from '../../rulesets/registry';
import {
	branchLinks,
	type Point,
} from './geneLayout';
import { parallax } from './geneStyle';
import GeneticsBackdrop from './GeneticsBackdrop';
import GeneticsCards, { STAR } from './GeneticsCards';
import GeneticsSky from './GeneticsSky';
import RingCompass from './RingCompass';
import useGeneticsKeys from './useGeneticsKeys';
import useSkyTurn from './useSkyTurn';

type Props = {
	def: GeneticsDef,
	picked?: string,
	/** the character's other genetics */
	others: readonly string[],
	/** the character plays locally */
	local: boolean,
};

/** The trees before picking, read-only: as they'd be on the picked skill, or on the one shown. */
export default function GeneticsPreview({
	def, picked, others, local,
}: Props) {
	const sky = useSkyTurn(def, picked ?? def.ring[0]);
	const placed = useRef<Record<string, Point>>({});
	const shown = sky.shown ?? def.ring[0];
	const genetic = picked ?? shown;
	const picks = [...others.filter(s => s !== genetic), genetic];
	const genetics = {
		...NO_GENETICS, picks: picks.map(skill => ({ skill })),
	};
	const gene = sky.selected === STAR ? undefined : sky.selected;
	const name = selectedDef().skillName(genetic);
	useGeneticsKeys({
		layer: LAYER.GENETIC_CHOICE,
		placed,
		links: branchLinks(def.genes.filter(g => g.skill === shown)),
		selected: gene,
		paused: false,
		select: next => {
			if (next && next !== sky.selected) uiSound('ui/default-hover');
			sky.select(next);
		},
		turn: sky.turnBy,
	});

	return (
		<div className="genetic-choice__trees">
			<GeneticsBackdrop />
			<div className="genetic-choice__trees-head">
				<h1 className="genetic-choice__title"><Trans>If you were born good at {name}</Trans></h1>
				<div className="genetic-choice__under">
					<Trans>Only a preview: you learn genes with climaxx once you've begun.</Trans>
				</div>
			</div>
			<div
				className="genetics genetics--preview"
				onClick={() => sky.select(undefined)}
				onPointerMove={parallax}
			>
				<div className="genetics__stage">
					<GeneticsSky
						def={def}
						genetics={genetics}
						at={sky.at}
						selected={gene}
						select={sky.select}
						turnBy={sky.turnBy}
						star={() => sky.select(STAR)}
						placed={p => (placed.current = p)}
					/>
					<GeneticsCards
						def={def}
						genetics={genetics}
						skill={shown}
						selected={sky.selected}
						at={gene ? placed.current[gene] : undefined}
					/>
				</div>
				<RingCompass def={def} picked={picks} shown={shown} onPick={sky.turnTo} />
				{local && (
					<div className="genetics__keys">
						<Trans>A local character only gets the XP and overdrive genes.</Trans>
					</div>
				)}
			</div>
		</div>
	);
}
