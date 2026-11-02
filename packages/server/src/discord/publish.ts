import { type RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/rest';

/** Post to a Discord webhook. Returns whether it landed - Discord rejects a
 *  malformed embed with a 4xx, which used to pass unnoticed. */
export const publish = async (
	webhook: string, message: RESTPostAPIWebhookWithTokenJSONBody,
): Promise<boolean> => {
	if (!webhook) return false;
	try {
		const res = await fetch(webhook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(message),
		});
		if (!res.ok) console.log('Webhook rejected', res.status, await res.text());
		return res.ok;
	} catch(e) {
		console.log('Could not send webhook', e);
		return false;
	}
};