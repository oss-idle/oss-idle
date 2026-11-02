import {
	NEWS_TAGS,
	type NewsTag,
} from '@oss-idle/shared/news';

import type { NewsRow } from '../db/schema/news';
import {
	chunkText,
	htmlToMarkdown,
} from '../discord/markdown';
import { publish } from '../discord/publish';
import {
	apiBaseUrl,
	clientUrl,
	env,
	isProd,
} from '../env';

/** Discord's limit is 4096 chars per embed description: a longer article is cut there. */
const CHUNK = 3800;

export type AnnounceArticle = Pick<NewsRow,
	'slug' | 'title' | 'summary' | 'content' | 'tag' | 'imageUrl'>;

/** The tag chip's colour on the site (hsl(hue 55% 42%)), as a Discord int. */
const tagColour = (hue: number): number => {
	const [s, l] = [0.55, 0.42];
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] = hue < 60 ? [c, x, 0]
		: hue < 120 ? [x, c, 0]
			: hue < 180 ? [0, c, x]
				: hue < 240 ? [0, x, c]
					: hue < 300 ? [x, 0, c]
						: [c, 0, x];
	const byte = (v: number) => Math.round((v + m) * 255);
	return (byte(r) << 16) + (byte(g) << 8) + byte(b);
};

/** Cover image: the uploaded one (served by the API), else the tag's default
 *  (a static file of the web platform), else none - the embed just has no image. */
const coverUrl = (article: AnnounceArticle, tag: (typeof NEWS_TAGS)[NewsTag]) => {
	if (article.imageUrl) {
		return /^https?:\/\//.test(article.imageUrl)
			? article.imageUrl
			: `${apiBaseUrl}${article.imageUrl}`;
	}
	return tag.image ? `${clientUrl}/web/news-media/${tag.image}` : undefined;
};

/**
 * Post a published article to the news feed: one message, converted to Discord
 * markdown, with the cover and a link back to the site. A long article is cut at a
 * line break and ends with the link to the full post. No-op outside prod or without a
 * configured webhook, and the caller claims the announce first so it fires exactly
 * once per article.
 */
export const announceNews = async (
	article: AnnounceArticle, authorName: string,
): Promise<boolean> => {
	if (!isProd || !env.NEWS_FEED_WEBHOOK) return true;

	const tag = NEWS_TAGS[article.tag as NewsTag] ?? NEWS_TAGS.update;
	const url = `${clientUrl}/web/news/${article.slug}`;
	const image = coverUrl(article, tag);
	const body = htmlToMarkdown(article.content);
	const [opening, ...rest] = chunkText(`*${article.summary}*\n\n${body}`, CHUNK);
	// a cut right after a heading would leave it with nothing under it
	const shown = rest.length ? opening.replace(/\n+#+ [^\n]*$/, '') : opening;
	const link = rest.length ? `…\n\n[Read the full post](${url})` : `[Read it on the website](${url})`;

	return publish(env.NEWS_FEED_WEBHOOK, {
		embeds: [{
			author: { name: tag.label },
			title: article.title,
			url,
			...(image ? { image: { url: image } } : {}),
			footer: { text: `by ${authorName}` },
			timestamp: new Date().toISOString(),
			description: `${shown}\n\n${link}`,
			color: tagColour(tag.hue),
		}],
	});
};
