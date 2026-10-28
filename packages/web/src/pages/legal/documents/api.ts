import { EMAIL } from '../identity';
import type { Bilingual } from './types';

export const api: Bilingual = {
	en: {
		title: 'API Terms of Use',
		sections: [
			{
				title: 'What these terms cover',
				blocks: [
					'These terms apply to the oss!idle API and to the applications you register in the OAuth section of your settings. By registering an application, you accept them, on top of the Terms of Use and the Rules.',
				],
			},
			{
				title: 'Your application',
				blocks: [
					'You are responsible for your application and for everything it does with the API. Keep its client secret secret: whoever holds it can act as your application. If it leaks, reset it from your settings.',
					'Your application\'s name must follow the Rules. Do not present it as made, run or endorsed by oss!idle or by osu!. You may say that it uses the oss!idle API.',
				],
			},
			{
				title: 'Players\' data',
				blocks: [
					{
						list: [
							'ask only for the permissions your application needs;',
							'use what a player lets you see only for what your application does, and tell them what that is;',
							'do not sell what you get from the API, or hand it on to others;',
							'when a player revokes your access or asks you to, delete what you kept about them that is not public;',
							'you are responsible for your own obligations toward players, including the GDPR when it applies to you.',
						],
					},
				],
			},
			{
				title: 'Fair use',
				blocks: [
					'Stay under the rate limits written in the API documentation and keep what you can instead of asking again. Do not get around the limits with several applications, accounts or addresses.',
					'Do not use the API to cheat, to spam, to harm or harass players, or to copy oss!idle wholesale.',
				],
			},
			{
				title: 'Simulations',
				blocks: [
					'An application with the simulate permission can ask how a play would go for a given character. We keep nothing of these requests. Only the count of requests is kept, for a minute, to apply the rate limit.',
				],
			},
			{
				title: 'No guarantee',
				blocks: [
					'The API is free and provided as it is. It can change, break or stop; we try to announce changes that break applications in the news beforehand.',
					'If these terms are broken, we can revoke an application\'s access, delete it, and restrict the account that registered it.',
				],
			},
			{
				title: 'Contact',
				blocks: [
					`For any question about the API or these terms: ${EMAIL}.`,
				],
			},
		],
	},
	fr: {
		title: 'Conditions d\'utilisation de l\'API',
		sections: [
			{
				title: 'Ce que couvrent ces conditions',
				blocks: [
					'Ces conditions s\'appliquent à l\'API d\'oss!idle et aux applications que vous enregistrez dans la section OAuth de vos réglages. En enregistrant une application, vous les acceptez, en plus des conditions d\'utilisation et des règles.',
				],
			},
			{
				title: 'Votre application',
				blocks: [
					'Vous êtes responsable de votre application et de tout ce qu\'elle fait avec l\'API. Gardez son secret client secret : qui le détient peut agir au nom de votre application. S\'il fuite, réinitialisez-le depuis vos réglages.',
					'Le nom de votre application doit respecter les règles. Ne la présentez pas comme faite, gérée ou approuvée par oss!idle ou par osu!. Vous pouvez dire qu\'elle utilise l\'API d\'oss!idle.',
				],
			},
			{
				title: 'Les données des joueurs',
				blocks: [
					{
						list: [
							'ne demandez que les permissions dont votre application a besoin ;',
							'n\'utilisez ce qu\'un joueur vous laisse voir que pour ce que fait votre application, et dites-lui ce que c\'est ;',
							'ne vendez pas ce que vous obtenez de l\'API et ne le transmettez pas à d\'autres ;',
							'quand un joueur retire votre accès ou vous le demande, supprimez ce que vous avez gardé sur lui et qui n\'est pas public ;',
							'vous êtes responsable de vos propres obligations envers les joueurs, y compris le RGPD quand il s\'applique à vous.',
						],
					},
				],
			},
			{
				title: 'Usage raisonnable',
				blocks: [
					'Restez sous les limites de requêtes indiquées dans la documentation de l\'API et gardez ce que vous pouvez plutôt que de le redemander. Ne contournez pas les limites avec plusieurs applications, comptes ou adresses.',
					'N\'utilisez pas l\'API pour tricher, envoyer du spam, nuire aux joueurs ou les harceler, ou copier oss!idle en entier.',
				],
			},
			{
				title: 'Simulations',
				blocks: [
					'Une application qui a la permission simulate peut demander comment se passerait une partie pour un personnage donné. Nous ne gardons rien de ces requêtes. Seul le nombre de requêtes est gardé, pendant une minute, pour appliquer la limite de requêtes.',
				],
			},
			{
				title: 'Sans garantie',
				blocks: [
					'L\'API est gratuite et fournie telle quelle. Elle peut changer, cesser de fonctionner ou s\'arrêter ; nous essayons d\'annoncer à l\'avance dans les actualités les changements qui cassent les applications.',
					'Si ces conditions ne sont pas respectées, nous pouvons retirer l\'accès d\'une application, la supprimer, et restreindre le compte qui l\'a enregistrée.',
				],
			},
			{
				title: 'Contact',
				blocks: [
					`Pour toute question sur l'API ou ces conditions : ${EMAIL}.`,
				],
			},
		],
	},
};
