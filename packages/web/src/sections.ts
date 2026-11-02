import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBug } from '@fortawesome/free-solid-svg-icons/faBug';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons/faCircleQuestion';
import { faCode } from '@fortawesome/free-solid-svg-icons/faCode';
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload';
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass';
import { faMusic } from '@fortawesome/free-solid-svg-icons/faMusic';
import { faNewspaper } from '@fortawesome/free-solid-svg-icons/faNewspaper';
import { faRobot } from '@fortawesome/free-solid-svg-icons/faRobot';
import { faScaleBalanced } from '@fortawesome/free-solid-svg-icons/faScaleBalanced';
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons/faShieldHalved';
import { faTrophy } from '@fortawesome/free-solid-svg-icons/faTrophy';
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser';
import { faUserGroup } from '@fortawesome/free-solid-svg-icons/faUserGroup';
import { faUsers } from '@fortawesome/free-solid-svg-icons/faUsers';

const BRAND = 274;

// osu!web's section_to_hue_map, with our own hues
const SECTIONS: Record<string, [hue: number, icon: IconDefinition]> = {
	'': [BRAND, faHouse],
	c: [BRAND, faUser],
	bot: [BRAND, faRobot],
	friends: [BRAND, faUserGroup],
	groups: [BRAND, faUsers],
	settings: [BRAND, faGear],
	oauth: [BRAND, faGear],
	search: [BRAND, faMagnifyingGlass],
	maps: [185, faMusic],
	scores: [185, faMusic],
	rankings: [215, faTrophy],
	news: [305, faNewspaper],
	changelog: [305, faNewspaper],
	matches: [140, faUsers],
	store: [340, faHeart],
	download: [20, faDownload],
	help: [20, faCircleQuestion],
	bugs: [20, faBug],
	docs: [20, faCode],
	legal: [20, faScaleBalanced],
	admin: [0, faShieldHalved],
};

/** The section of a /web pathname: its first segment after the base. */
export const sectionOf = (pathname: string) =>
	SECTIONS[pathname.replace(/^\/(web\/?)?/, '').split('/')[0]] ?? SECTIONS[''];
