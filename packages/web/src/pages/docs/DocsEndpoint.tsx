import type { Endpoint } from './content';
import DocsParams from './DocsParams';
import DocsSample from './DocsSample';
import DocsScope from './DocsScope';
import type { Language } from './samples';

/** One endpoint, laid out like a Scribe page: badges, examples on the right, parameters, response. */
export default function DocsEndpoint({ endpoint: e, api, language }: {
	endpoint: Endpoint;
	api: string;
	language: Language;
}) {
	const method = e.method ?? 'GET';
	return <>
		<h2 id={e.id}>{e.title}</h2>
		<p>
			{e.user && <>
				<a className='docs__badge docs__badge--user' href='#resource-owner'>requires user</a>{' '}
			</>}
			<a className='docs__badge docs__badge--oauth' href='#authentication'>OAuth</a>{' '}
			<DocsScope scope={e.scope} />
		</p>
		<p>{e.about}</p>
		<DocsSample
			request={{
				method, url: `${api}/api/v2${e.example.path}`, query: e.example.query, json: e.example.body,
			}}
			response={e.response}
			language={language}
		/>
		<h3>Request</h3>
		<p>
			<small className={`docs__badge docs__badge--${method.toLowerCase()}`}>{method}</small>{' '}
			<b><code>{e.path}</code></b>
		</p>
		{e.url && <DocsParams title='URL Parameters' params={e.url} />}
		{e.query && <DocsParams title='Query Parameters' params={e.query} />}
		{e.body && <DocsParams title='Body Parameters' params={e.body} />}
		<h3>Response format</h3>
		<p>{e.format}</p>
	</>;
}
