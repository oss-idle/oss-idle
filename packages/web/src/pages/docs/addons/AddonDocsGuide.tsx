import {
	API,
	CAN_UPDATE,
	CONTRACT,
	SCAFFOLD,
	SDK_ADDON,
	SHARED_REACT,
} from './addonDocs';
import DocsCode from './DocsCode';

/** The guide's first part: what add-ons are, making and publishing one, the contract, types, React. */
export default function AddonDocsGuide() {
	return <>
		<h1 id='introduction'>Introduction</h1>
		<p>
			Add-ons are scripts players install from the game&apos;s Add-ons page (Options, then Browse
			add-ons). They run inside oss!idle with the same access the game has: its page, its database,
			its maps. That is what makes them useful, and why each one shows its code: add-ons are not
			reviewed, so read what you install.
		</p>
		<p>
			An add-on is one JavaScript module. It may not load anything else: everything it uses, apart from
			what the game hands it, is inside that one file.
		</p>

		<h1 id='making-one'>Making one</h1>
		<p>
			The <a href='https://github.com/oss-idle/addon-sdk'>add-on SDK</a> sets up a project, bundles it
			into the one file the game wants, and gives you helpers for the game&apos;s data, settings, keys
			and React overlays.
		</p>
		<DocsCode code={SCAFFOLD} language='bash' caption='A new project:' />
		<p>Then, in game, under Add-ons, Manage, Create new add-on, either:</p>
		<ul>
			<li>
				<strong>Code written here</strong>: paste or write the file in the editor, save, and publish
				it;
			</li>
			<li>
				<strong>Built from a git repository</strong>: <code>npm run setup</code> checks the
				repository and prints what to fill in; add the webhook the add-on shows you, and release with
				{' '}<code>npm run release</code>, which tags the next version (<code>v1.2.3</code>) and pushes
				it. We build it ourselves from that tag (<code>npm ci --ignore-scripts</code>, then
				{' '}<code>npm run build</code> without network), so players can read the repository it comes
				from.
			</li>
		</ul>
		<p>
			Published add-on code must be licensed under the AGPLv3 or a compatible licence.
		</p>

		<h1 id='the-contract'>The contract</h1>
		<p>
			The game imports the module and calls two of its exports. <code>mount</code> runs when the
			player enables the add-on, and at every start after that. <code>unmount</code> runs when the add-on
			is disabled, updated or removed, without a reload: it must undo everything <code>mount</code>
			{' '}did, or what it leaves keeps running in the player&apos;s game.
		</p>
		<DocsCode code={CONTRACT} />
		<p>
			<code>mount</code> gets the add-on&apos;s own details and the game&apos;s host:
		</p>
		<table>
			<thead><tr><th>Field</th><th>What it is</th></tr></thead>
			<tbody>
				<tr><td><code>host.version</code></td><td>The game&apos;s version.</td></tr>
				<tr>
					<td><code>host.react</code></td>
					<td>
						The game&apos;s React, by import path: <code>react</code>, <code>react-dom</code>,
						{' '}<code>react-dom/client</code>, <code>react/jsx-runtime</code>.
					</td>
				</tr>
				<tr>
					<td><code>host.api</code></td>
					<td>The API as the signed-in player (see <a href='#the-api'>The API</a>).</td>
				</tr>
				<tr>
					<td><code>host.editor</code></td>
					<td>The editor, for add-ons of the Editor type (see <a href='#the-editor'>The editor</a>).</td>
				</tr>
			</tbody>
		</table>
		<p>
			The same host is on <code>globalThis.ossIdle</code>, for code that runs before <code>mount</code>.
			With the SDK, <code>defineAddon</code> and the <code>Addon</code> class do the bookkeeping:
			whatever you register through <code>this.on</code>, <code>this.own</code>,
			{' '}<code>this.interval</code> or <code>this.editor</code> is undone for you.
		</p>
		<DocsCode code={SDK_ADDON} caption='With the SDK:' />

		<h2 id='auto-updates'>Auto-updates</h2>
		<p>
			A player can set an installed add-on to auto-update: the game checks for a new version every
			minute and, as soon as one is out, unmounts the running add-on and mounts the new one. To hold
			that while it is busy (a recording, an unsaved form), export <code>canUpdate</code> and return
			{' '}<code>false</code>; the game asks again every few seconds.
		</p>
		<DocsCode code={CAN_UPDATE} />

		<h2 id='the-api'>The API</h2>
		<p>
			<code>host.api</code> calls the <a href='/web/docs'>API</a> as the signed-in player, with every
			{' '}scope: one method per endpoint, and calls that take a ruleset default to the one the player
			{' '}picked. It answers with what the server knows, not the player&apos;s local state. A call fails
			{' '}with an error carrying the HTTP <code>status</code>: 401 while the player is a guest, 429 past
			{' '}the rate limits.
		</p>
		<DocsCode code={API} />

		<h1 id='types-and-tags'>Types and tags</h1>
		<p>
			Every add-on has a type, picked when you make it, and Browse filters on them:
		</p>
		<ul>
			<li><strong>Gameplay</strong>, the default: it works around play, song select, the menus.</li>
			<li><strong>Editor</strong>: it works in the map editor, through the editor API.</li>
			<li><strong>Misc</strong>: anything else.</li>
		</ul>
		<p>
			An add-on can have several. Tags are your own words on top (up to 8, lowercase), to help players
			search.
		</p>

		<h1 id='react'>The game&apos;s React</h1>
		<p>
			The game already runs React, so an add-on does not need its own. With the SDK, set
			{' '}<code>sharedReact</code> in <code>addon.config.json</code> and import React as usual: the
			bundle reads the game&apos;s copy from the host and ships none of it. Without the SDK, take it
			from <code>host.react</code>. Either way there is one React on the page, and your add-on is
			smaller.
		</p>
		<DocsCode code={SHARED_REACT} />
		<p>
			A game too old to hand out its React refuses such an add-on with a clear message. To support older
			games, leave <code>sharedReact</code> off. The SDK&apos;s README covers the rest: overlays,
			settings, keys and the game&apos;s data.
		</p>
	</>;
}
