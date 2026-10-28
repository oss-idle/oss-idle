import {
	Trans,
	useLingui,
} from '@lingui/react/macro';

import accuracyText from '@oss-idle/shared/display/accuracy';
import num from '@oss-idle/shared/display/num';
import { GUEST_AVATAR_URL } from '@oss-idle/shared/osu/profile';
import hitAccuracy from '@oss-idle/shared/rulesets/mania/hitAccuracy';
import { countsOf } from '@oss-idle/shared/rulesets/ruleset';
import {
	levelProgress,
	xpGivesLevel,
} from '@oss-idle/shared/xp';

import Character from '../../db/schema/character';
import {
	isWebOpen,
	webUrl,
} from '../../globals';
import Auth from '../../online/auth';
import {
	getCharacter,
	getCharacterStats,
} from '../../online/services/characters';
import GlobalRank from './GlobalRank';

/** Profile card: avatar + online stats, clicking through to oss! web
 *  (or the login flow for a guest). Online stats only show once loaded. */
export default function UserCard({ 
	character, 
	online_character, 
	online_stats, 
}: {
	character: Character;
	online_character: Awaited<ReturnType<typeof getCharacter>> | undefined;
	online_stats: Awaited<ReturnType<typeof getCharacterStats>> | undefined;
}) {
	const { t } = useLingui();
	const overall = online_character && xpGivesLevel(online_character.profile.overallLifetimeXp);
	const pp = num(online_character?.profile.pp);
	const accuracy = online_stats && accuracyText(hitAccuracy(countsOf(online_stats)));
	const level = num(overall?.level);
	const progress = overall ? levelProgress(overall.level, overall.xp) : 0;
	return (
		<div
			className="game__user"
			title={t`Open oss! web`}
			onClick={async () => {
				if (character.isGuest()) { Auth.signIn(); return; }
				await webUrl.set(`c/${character.id}`);
				await isWebOpen.set(true);
			}}
		>
			<div className="game__avatar">
				<img 
					className="game__avatar-img" 
					src={online_character?.avatarUrl ?? GUEST_AVATAR_URL} 
					alt="" 
				/>
			</div>
			<div className="game__user-meta">
				<span className="game__user-name">{character.name}</span>
				{online_character && (<>
					<span className="game__user-pp"><Trans>Performance: {pp}pp</Trans></span>
					<span className="game__user-acc"><Trans>Accuracy: {accuracy}</Trans></span>
					<span className="game__user-level"><Trans>Lv{level}</Trans></span>
				</>)}
				{!online_character && (
					<span className="game__user-pp"><Trans>Click here to login!</Trans></span>
				)}
				<GlobalRank globalRank={online_stats?.globalRank} percent={online_stats?.globalRankPercent} />
				<div className="game__user-level-bar">
					<div
						className="game__user-level-bar-fill"
						style={{ width: `${Math.min(1, progress) * 100}%` }}
					/>
				</div>
			</div>
		</div>
	);
}
