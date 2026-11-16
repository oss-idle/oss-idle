import {
	ADDRESS,
	EMAIL,
	PUBLISHER,
} from '../identity';
import type { Bilingual } from './types';

export const privacy: Bilingual = {
	en: {
		title: 'Privacy Policy',
		sections: [
			{
				title: 'Who is responsible',
				blocks: [
					`${PUBLISHER}, ${ADDRESS}, runs oss!idle and decides what is done with your data (the "controller" under the GDPR). For any question or request: ${EMAIL}.`,
				],
			},
			{
				title: 'What we keep, and why',
				blocks: [
					{ sub: 'Your account' },
					'When you sign in with osu!, we receive and keep your osu! id, username, avatar and country. We also keep your characters (name, former names, avatar, banner, title), your scores, levels, medals and rankings, your friends and blocks, your settings, and when you were last online. This is what the game is made of: we need it to provide the service you asked for.',
					{ sub: 'Chat and reports' },
					'Messages in public channels are relayed to the players in the channel and kept for 24 hours so that moderators can act on them. Private messages are never stored on our servers: they are delivered while the other player is online, and the only copy is the one kept in each player\'s own browser or app. Reports you send are kept with their comment until they are dealt with. Mutes and bans are kept while they apply. Our reason here is keeping the community safe (legitimate interest).',
					{ sub: 'Online presence and the world map' },
					'While you are connected, other players see that you are online, what you are doing in the game, your local time and a rough position on the world map. That position is worked out from your IP address with an offline database and rounded to a coarse grid (or your country\'s centre); your IP address itself is not kept. All of this disappears about 90 seconds after you disconnect.',
					{ sub: 'Discord' },
					'If you link your Discord account, we keep your Discord id to give you your level role on our Discord server. When you create a character, its name, your osu! username and avatar are posted in a channel of our Discord server.',
					{ sub: 'Twitch' },
					'If you link your Twitch account, we keep your Twitch id. The applications you authorize can read it to know which Twitch account is yours.',
					{ sub: 'Purchases' },
					'When you buy a supporter tag, payment is handled by Stripe, which receives your payment details, email and billing country; we never see your card. We keep your orders (date, amount, duration, who the tag was for) and your Stripe customer id. We keep payment records for 10 years, as French accounting law requires.',
					{ sub: 'Applications (the API)' },
					'If you register an application on our API, we keep its name, its callback URLs and its client secret, attached to your account. If you authorize someone\'s application, we keep which one, the permissions you gave it and its access tokens, until they expire or you revoke them from your settings. That application then receives what those permissions allow; it is run by its developer, not by us, and its own privacy policy applies.',
					{ sub: 'Technical logs' },
					'Our servers log requests (address requested, status, timing) and errors, without your IP address, to keep oss!idle running and fix problems.',
				],
			},
			{
				title: 'What is public',
				blocks: [
					'Your character profile is public: name, former names, avatar, banner, title, country, your osu! username, supporter status, scores, medals, statistics and rankings. It can also be read through our public API, by the applications registered on it. Chat messages are visible to everyone in the channel. Your friends list and blocks are private: an application only sees your friends if you give it that permission.',
				],
			},
			{
				title: 'Who receives your data',
				blocks: [
					'We do not sell your data, and there is no advertising or tracking in oss!idle. Data only goes to the services that make it work:',
					{
						list: [
							'osu! (ppy Pty Ltd) for signing in;',
							'Stripe for payments (Stripe may process data in the United States, under the EU-US Data Privacy Framework and standard contractual clauses);',
							'Discord, only if you link your account or through our Discord server (Discord is based in the United States);',
							'Twitch, only if you link your account (Twitch is based in the United States);',
							'our hosting provider, OVH, which runs the servers in France, and in Canada for the North American players who connect through our relay there (the EU recognises Canada as protecting personal data adequately);',
							'the applications you authorize yourself, with the permissions you gave them.',
						],
					},
				],
			},
			{
				title: 'How long we keep it',
				blocks: [
					{
						list: [
							'account and game data: until you ask us to delete your account;',
							'public chat messages: 24 hours;',
							'presence and position: while you are online, plus about 90 seconds;',
							'applications you registered: until you delete them or your account;',
							'applications you authorized: until their access expires (30 days without use at most) or you revoke it;',
							'payment records: 10 years;',
							'database backups: up to 6 months, after which they are deleted.',
						],
					},
				],
			},
			{
				title: 'Cookies and local storage',
				blocks: [
					'oss!idle uses a single cookie, "session", which keeps you signed in for 30 days. It is strictly necessary, so it needs no consent. There are no advertising or third-party cookies.',
					'The game also saves data in your browser or app: your settings, your guest progression, your playlists, skins and addons, and your private messages. It stays on your device and you can clear it at any time.',
				],
			},
			{
				title: 'Your rights',
				blocks: [
					`You can ask to see, correct, export or delete your data, to restrict its use, or object to it, by writing to ${EMAIL}. To delete your account, tell us your character name and we will check that it is you. We answer within one month. Deleting an account removes its characters, scores, uploads and everything attached to them, and cancels any subscription. Payment records stay, without the account, because we must keep them. Copies left in our backups go within 6 months.`,
					'If you think we did not respect your rights, you can complain to the CNIL (www.cnil.fr) or to the data protection authority of your country.',
				],
			},
			{
				title: 'Children',
				blocks: [
					'You must be at least 13 to sign in. In France, a parent or guardian must agree before a child under 15 signs in.',
				],
			},
			{
				title: 'Changes',
				blocks: [
					'If this policy changes, the date at the top changes too, and important changes are announced in the news.',
				],
			},
		],
	},
	fr: {
		title: 'Politique de confidentialité',
		sections: [
			{
				title: 'Qui est responsable',
				blocks: [
					`${PUBLISHER}, ${ADDRESS}, édite oss!idle et décide de l'usage de vos données (le « responsable de traitement » au sens du RGPD). Pour toute question ou demande : ${EMAIL}.`,
				],
			},
			{
				title: 'Ce que nous conservons, et pourquoi',
				blocks: [
					{ sub: 'Votre compte' },
					'Quand vous vous connectez avec osu!, nous recevons et conservons votre identifiant osu!, votre pseudo, votre avatar et votre pays. Nous conservons aussi vos personnages (nom, anciens noms, avatar, bannière, titre), vos scores, niveaux, médailles et classements, vos amis et blocages, vos réglages, et votre dernière connexion. C\'est ce qui fait le jeu : nous en avons besoin pour fournir le service que vous demandez.',
					{ sub: 'Chat et signalements' },
					'Les messages des salons publics sont transmis aux joueurs du salon et conservés 24 heures pour que les modérateurs puissent agir. Les messages privés ne sont jamais stockés sur nos serveurs : ils sont remis tant que l\'autre joueur est en ligne, et la seule copie est celle gardée dans le navigateur ou l\'application de chaque joueur. Les signalements que vous envoyez sont conservés avec leur commentaire jusqu\'à leur traitement. Les sanctions de chat sont conservées tant qu\'elles s\'appliquent. Notre raison ici est la sécurité de la communauté (intérêt légitime).',
					{ sub: 'Présence en ligne et carte du monde' },
					'Tant que vous êtes connecté, les autres joueurs voient que vous êtes en ligne, ce que vous faites dans le jeu, votre heure locale et une position approximative sur la carte du monde. Cette position est déduite de votre adresse IP avec une base de données hors ligne, arrondie à une grille grossière (ou au centre de votre pays) ; votre adresse IP elle-même n\'est pas conservée. Tout cela disparaît environ 90 secondes après votre déconnexion.',
					{ sub: 'Discord' },
					'Si vous liez votre compte Discord, nous conservons votre identifiant Discord pour vous donner votre rôle de niveau sur notre serveur Discord. Quand vous créez un personnage, son nom, votre pseudo osu! et votre avatar sont publiés dans un salon de notre serveur Discord.',
					{ sub: 'Twitch' },
					'Si vous liez votre compte Twitch, nous conservons votre identifiant Twitch. Les applications que vous autorisez peuvent le lire pour savoir quel compte Twitch est le vôtre.',
					{ sub: 'Achats' },
					'Quand vous achetez un tag supporter, le paiement est géré par Stripe, qui reçoit vos données de paiement, votre e-mail et votre pays de facturation ; nous ne voyons jamais votre carte. Nous conservons vos commandes (date, montant, durée, destinataire du tag) et votre identifiant client Stripe. Les justificatifs de paiement sont conservés 10 ans, comme l\'exige le droit comptable français.',
					{ sub: 'Applications (l\'API)' },
					'Si vous enregistrez une application sur notre API, nous conservons son nom, ses URL de retour et son secret client, rattachés à votre compte. Si vous autorisez l\'application de quelqu\'un, nous conservons laquelle, les permissions que vous lui avez données et ses jetons d\'accès, jusqu\'à leur expiration ou jusqu\'à ce que vous les révoquiez depuis vos réglages. Cette application reçoit alors ce que ces permissions permettent ; elle est gérée par son développeur, pas par nous, et sa propre politique de confidentialité s\'applique.',
					{ sub: 'Journaux techniques' },
					'Nos serveurs journalisent les requêtes (adresse demandée, statut, durée) et les erreurs, sans votre adresse IP, pour faire fonctionner oss!idle et corriger les problèmes.',
				],
			},
			{
				title: 'Ce qui est public',
				blocks: [
					'Le profil de votre personnage est public : nom, anciens noms, avatar, bannière, titre, pays, votre pseudo osu!, statut de supporter, scores, médailles, statistiques et classements. Il peut aussi être lu via notre API publique, par les applications qui y sont enregistrées. Les messages du chat sont visibles par tout le salon. Votre liste d\'amis et vos blocages sont privés : une application ne voit vos amis que si vous lui en donnez la permission.',
				],
			},
			{
				title: 'Qui reçoit vos données',
				blocks: [
					'Nous ne vendons pas vos données, et il n\'y a ni publicité ni pistage dans oss!idle. Les données ne vont qu\'aux services qui le font fonctionner :',
					{
						list: [
							'osu! (ppy Pty Ltd) pour la connexion ;',
							'Stripe pour les paiements (Stripe peut traiter des données aux États-Unis, dans le cadre du Data Privacy Framework UE-États-Unis et de clauses contractuelles types) ;',
							'Discord, seulement si vous liez votre compte ou via notre serveur Discord (Discord est basé aux États-Unis) ;',
							'Twitch, seulement si vous liez votre compte (Twitch est basé aux États-Unis) ;',
							'notre hébergeur, OVH, qui fait tourner les serveurs en France, et au Canada pour les joueurs d\'Amérique du Nord qui passent par notre relais là-bas (l\'UE reconnaît que le Canada protège les données personnelles de façon adéquate) ;',
							'les applications que vous autorisez vous-même, avec les permissions que vous leur avez données.',
						],
					},
				],
			},
			{
				title: 'Combien de temps',
				blocks: [
					{
						list: [
							'données du compte et du jeu : jusqu\'à ce que vous demandiez la suppression de votre compte ;',
							'messages du chat public : 24 heures ;',
							'présence et position : tant que vous êtes en ligne, plus environ 90 secondes ;',
							'applications que vous avez enregistrées : jusqu\'à ce que vous les supprimiez, ou votre compte ;',
							'applications que vous avez autorisées : jusqu\'à l\'expiration de leur accès (30 jours sans utilisation au plus) ou sa révocation ;',
							'justificatifs de paiement : 10 ans ;',
							'sauvegardes de la base de données : 6 mois au plus, puis elles sont supprimées.',
						],
					},
				],
			},
			{
				title: 'Cookies et stockage local',
				blocks: [
					'oss!idle utilise un seul cookie, « session », qui vous garde connecté pendant 30 jours. Il est strictement nécessaire et ne demande donc pas de consentement. Il n\'y a aucun cookie publicitaire ou tiers.',
					'Le jeu enregistre aussi des données dans votre navigateur ou application : vos réglages, votre progression en invité, vos playlists, skins et addons, et vos messages privés. Elles restent sur votre appareil et vous pouvez les effacer à tout moment.',
				],
			},
			{
				title: 'Vos droits',
				blocks: [
					`Vous pouvez demander à consulter, corriger, exporter ou supprimer vos données, à en limiter l'usage ou vous y opposer, en écrivant à ${EMAIL}. Pour supprimer votre compte, indiquez le nom de votre personnage et nous vérifierons qu'il s'agit bien de vous. Nous répondons sous un mois. La suppression d'un compte efface ses personnages, ses scores, ses fichiers et tout ce qui s'y rattache, et met fin à tout abonnement. Les justificatifs de paiement restent, détachés du compte, car nous devons les conserver. Les copies restées dans nos sauvegardes disparaissent sous 6 mois.`,
					'Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (www.cnil.fr) ou l\'autorité de protection des données de votre pays.',
				],
			},
			{
				title: 'Mineurs',
				blocks: [
					'Il faut avoir au moins 13 ans pour se connecter. En France, l\'accord d\'un parent ou tuteur est nécessaire avant 15 ans.',
				],
			},
			{
				title: 'Modifications',
				blocks: [
					'Si cette politique change, la date en haut change aussi, et les changements importants sont annoncés dans les actualités.',
				],
			},
		],
	},
};
