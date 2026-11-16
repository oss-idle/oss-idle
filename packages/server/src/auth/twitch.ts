import {
	env,
	TWITCH_REDIRECT_URI,
} from '../env';

const ID = 'https://id.twitch.tv/oauth2';

export const twitchConfigured = (): boolean => !!env.TWITCH_CLIENT_SECRET;

/** No scope: the link only needs to know which Twitch account it is. */
export const twitchAuthorizeUrl = (state: string): string => {
	const query = new URLSearchParams({
		client_id: env.TWITCH_CLIENT_ID,
		redirect_uri: TWITCH_REDIRECT_URI,
		response_type: 'code',
		state,
	});
	return `${ID}/authorize?${query}`;
};

/** Trade an authorization code for the id of the Twitch account that granted it. */
export const fetchTwitchId = async (code: string): Promise<string> => {
	const token = await fetch(`${ID}/token`, {
		method: 'POST',
		body: new URLSearchParams({
			client_id: env.TWITCH_CLIENT_ID,
			client_secret: env.TWITCH_CLIENT_SECRET ?? '',
			grant_type: 'authorization_code',
			code,
			redirect_uri: TWITCH_REDIRECT_URI,
		}),
	});
	if (!token.ok) throw new Error(`Twitch token exchange failed: ${token.status} ${await token.text()}`);
	const { access_token } = await token.json() as { access_token: string };

	const me = await fetch(`${ID}/validate`, { headers: { Authorization: `OAuth ${access_token}` } });
	if (!me.ok) throw new Error(`Twitch /validate failed: ${me.status}`);
	const { user_id } = await me.json() as { user_id?: string };
	if (!user_id) throw new Error('Twitch /validate named no user');
	return user_id;
};
