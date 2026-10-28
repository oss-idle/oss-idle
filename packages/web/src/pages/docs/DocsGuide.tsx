import { SCOPES } from '@oss-idle/shared/oauth';

import Link from '../../components/Link';
import DocsParams from './DocsParams';
import DocsSample from './DocsSample';
import DocsScope from './DocsScope';
import {
	highlight,
	type Language,
} from './samples';

const TOKEN = {
	access_token: 'verylongstring',
	expires_in: 86400,
	refresh_token: 'anotherlongstring',
	token_type: 'Bearer',
};

const SCOPE_ABOUT = {
	public: 'Allows reading of publicly available data on behalf of the user.',
	identify:
		'Allows reading of the public profile of the user (/me). Always given to Authorization Code Grant tokens.',
	'friends.read': 'Allows reading of the user\'s friend list.',
	simulate: 'Allows simulating plays on behalf of the user (Simulate Play).',
};

const using = (api: string, language: Language) => (language === 'bash'
	? [
		'# With shell, you can just pass the correct header with each request',
		`curl "${api}/api/v2/[endpoint]" -H "Authorization: Bearer {{token}}"`,
	]
	: [
		'// This javascript example uses fetch()',
		`fetch("${api}/api/v2/[endpoint]", {`,
		'    headers: {',
		'      Authorization: \'Bearer {{token}}\'',
		'    }',
		'});',
	]).join('\n');

/** The part of osu!'s docs before the endpoints: introduction, terms, authentication and scopes. */
export default function DocsGuide({ api, site, language }: {
	api: string;
	site: string;
	language: Language;
}) {
	const client = {
		client_id: '1', client_secret: 'clientsecret',
	};

	return <>
		<h1 id='introduction'>Introduction</h1>
		<p>
			Welcome to the documentation for the oss!idle API. It works like osu!api v2: the same
			OAuth flows, paths and object names, with what oss!idle has. Use it to get information on
			players, their characters and scores, the ranked maps and the rankings.
		</p>
		<p>
			Code examples are provided in the dark area to the right, you can use the tabs at the top of
			the page to switch between bash and javascript samples.
		</p>

		<h1 id='terms-of-use'>Terms of Use</h1>
		<p>
			Use the API for good. Don't overdo it: cache what you get and reuse it rather than asking
			again. By using the API, you accept the <Link to='/legal/api'>API Terms of Use</Link>.
		</p>
		<p>
			An application can make <strong>up to 1200 requests per minute</strong>, and so can one IP
			address. Past that, requests answer 429 with a Retry-After header.
		</p>

		<h1 id='endpoint'>Endpoint</h1>
		<h2 id='base-url'>Base URL</h2>
		<p><code>{api}/api/v2</code></p>

		<h1 id='authentication'>Authentication</h1>
		<p>
			Every route needs a valid OAuth2 token. The API supports the Authorization Code Grant and the
			Client Credentials Grant. Before you can use the API, you will need to register an OAuth
			application, then get a token by authorizing players for your application or by requesting
			a Client Credentials token.
		</p>

		<h2 id='registering-an-oauth-application'>Registering an OAuth application</h2>
		<p>
			Register an OAuth application on your <Link to='/settings'>account settings page</Link>. To
			register one you will need to provide the:
		</p>
		<table>
			<thead><tr><th>Name</th><th>Description</th></tr></thead>
			<tbody>
				<tr>
					<td>Application Name</td>
					<td>
						This is the name that will be visible to users of your application. The name of your
						application cannot be changed.
					</td>
				</tr>
				<tr>
					<td>Application Callback URLs</td>
					<td>The URLs in your application where users can be sent after authorization, one per line.</td>
				</tr>
			</tbody>
		</table>
		<p>
			Your new OAuth application will have a <code>Client ID</code> and <code>Client Secret</code>;
			the <code>Client Secret</code> is like a password for your OAuth application, it should be kept
			private and <strong>do not share it with anyone else</strong>.
		</p>

		<h2 id='authorization-code-grant'>Authorization Code Grant</h2>
		<p>
			The flow to authorize users for your application is: requesting authorization from users,
			users are redirected back to your site, your application accesses the API with the user's
			access token.
		</p>
		<h3>Request authorization from a user</h3>
		<p>
			To request permission from the user, they should be redirected to the authorization page:
		</p>
		<DocsSample
			request={{
				method: 'GET',
				url: `${site}/web/oauth/authorize`,
				query: {
					client_id: '1', redirect_uri: 'http://localhost:4000', response_type: 'code', scope: 'public identify', state: 'randomval',
				},
				token: false,
			}}
			language={language}
		/>
		<p>
			<small className='docs__badge docs__badge--get'>GET</small>{' '}
			<b><code>{site}/web/oauth/authorize</code></b>
		</p>
		<DocsParams
			title='Query Parameters'
			params={[
				{
					name: 'client_id', type: 'integer', about: 'The Client ID you received when you registered.',
				},
				{
					name: 'redirect_uri',
					type: 'string',
					optional: true,
					about: 'Where users are sent after authorization. It must match one of the Application Callback URLs exactly. Defaults to the first.',
				},
				{
					name: 'response_type', type: 'string', about: 'This should always be code when requesting authorization.',
				},
				{
					name: 'scope', type: 'string', optional: true, about: 'A space-delimited string of scopes.',
				},
				{
					name: 'state', type: 'string', optional: true, about: 'Data that will be returned when a temporary code is issued. It can be used to provide a token for CSRF validation.',
				},
			]}
		/>
		<h3>User is redirected back to your site</h3>
		<p>
			If the user accepts your request, they will be redirected back to your site with a temporary
			single-use <code>code</code> contained in the URL parameter. If a <code>state</code> value was
			provided in the previous request, it will be returned here. If they refuse, the URL carries
			<code>error=access_denied</code> instead. The code works once, for 10 minutes.
		</p>
		<p>Exchange this <code>code</code> for an access token:</p>
		<DocsSample
			request={{
				method: 'POST',
				url: `${api}/oauth/token`,
				form: {
					...client, code: 'receivedcode', grant_type: 'authorization_code', redirect_uri: 'http://localhost:4000',
				},
			}}
			response={TOKEN}
			language={language}
		/>
		<p>
			<small className='docs__badge docs__badge--post'>POST</small>{' '}
			<b><code>{api}/oauth/token</code></b>
		</p>
		<p>The access token lasts a day (<code>expires_in</code>, in seconds).</p>
		<h3>Refreshing the access token</h3>
		<p>
			Use the refresh token to get a new access token. A refresh token works once and lasts 30 days:
			the response carries the next one.
		</p>
		<DocsSample
			request={{
				method: 'POST',
				url: `${api}/oauth/token`,
				form: {
					...client, grant_type: 'refresh_token', refresh_token: 'anotherlongstring',
				},
			}}
			response={TOKEN}
			language={language}
		/>

		<h2 id='client-credentials-grant'>Client Credentials Grant</h2>
		<p>
			The client credential flow provides a way for developers to get access tokens that do not have
			associated user permissions; as such, these tokens are considered as guest users. They only
			have the <DocsScope scope='public' /> scope.
		</p>
		<DocsSample
			request={{
				method: 'POST',
				url: `${api}/oauth/token`,
				form: {
					...client, grant_type: 'client_credentials', scope: 'public',
				},
			}}
			response={{
				access_token: 'verylongstring', expires_in: 86400, token_type: 'Bearer',
			}}
			language={language}
		/>
		<p>
			The token endpoint takes form or JSON bodies. Its errors follow OAuth 2:
			<code>{'{ "error": "invalid_client", "error_description": "…" }'}</code>.
		</p>

		<h2 id='using-the-access-token'>Using the access token to access the API</h2>
		<p>The token should be included in the header of requests to the API.</p>
		<p><code>Authorization: Bearer {'{{token}}'}</code></p>
		<pre><code dangerouslySetInnerHTML={{ __html: highlight(using(api, language), language) }} /></pre>
		<blockquote>
			<p>Make sure to replace <code>{'{{token}}'}</code> with your OAuth2 token.</p>
		</blockquote>
		<p>
			A request without a valid token answers 401, and one whose token lacks the scope answers 403.
			Other errors answer <code>{'{ "error": "…" }'}</code>.
		</p>

		<h2 id='resource-owner'>Resource Owner</h2>
		<p>
			The Resource Owner is the user that a token acts on behalf of. For Authorization Code Grant
			tokens, it is the user authorizing the token. Client Credentials Grant tokens do not have one.
			Routes marked{' '}
			<a className='docs__badge docs__badge--user' href='#resource-owner'>requires user</a>
			{' '}need one.
		</p>

		<h2 id='scopes'>Scopes</h2>
		<p>The following scopes are currently supported:</p>
		<table>
			<thead><tr><th>Name</th><th>Description</th></tr></thead>
			<tbody>
				{SCOPES.map(s => <tr key={s}>
					<td><a id={`scope-${s}`} className='docs__badge docs__badge--scope'>{s}</a></td>
					<td>{SCOPE_ABOUT[s]}</td>
				</tr>)}
			</tbody>
		</table>

		<h2 id='managing-oauth-applications'>Managing OAuth applications</h2>
		<p>
			Your <Link to='/settings'>account settings</Link> page will show your registered OAuth
			applications, and all the OAuth applications you have granted permissions to.
		</p>
		<h3>Reset Client Secret</h3>
		<p>
			You can generate a new <code>Client Secret</code> by choosing to "Reset client secret",
			however, this will disable all access tokens issued for the application.
		</p>
	</>;
}
