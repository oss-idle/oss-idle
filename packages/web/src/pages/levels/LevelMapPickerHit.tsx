import type { LevelMapHit } from '../../api/levelVotes';
import { coverBackground } from '../../api/maps';

export default function LevelMapPickerHit({ hit, onPick }: {
	hit: LevelMapHit,
	onPick: () => void,
}) {
	return (<button className='level-picker__hit' onClick={onPick}>
		<span
			className='level-map__cover'
			style={{
				backgroundImage: coverBackground({
					id: hit.setId, osuId: hit.osuId, osuCover: hit.osuCover, background: hit.background,
				}, 'list'),
			}}
		/>
		<span className='level-map__meta'>
			<span className='level-map__title'>{hit.artist} - {hit.title}</span>
			<span className='level-map__version'>
				<span className='level-map__stars'>★ {hit.sr.toFixed(2)}</span> {hit.version}
				<span className='level-map__artist'> · {hit.creator}</span>
			</span>
		</span>
	</button>);
}
