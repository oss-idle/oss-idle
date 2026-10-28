import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';

import type { AddonApi } from '@oss-idle/shared/apiV2';
import type { RulesetId } from '@oss-idle/shared/rulesets/ids';
import { VERSION } from '@oss-idle/shared/version';

import {
	type EditorHost,
	editorHost,
} from '../editor/editorHost';
import { selectedRuleset } from '../rulesets/registry';
import { addonApi } from './api';
import { Owned } from './owned';

/** The ruleset the player picked: an add-on made for one can tell when it is in another. */
export type RulesetHost = {
	current: () => RulesetId,
	/** called now and on every change; returns what stops it */
	watch: (onChange: (ruleset: RulesetId) => void) => () => void,
};

const rulesetHost: RulesetHost = {
	current: () => selectedRuleset.get(),
	watch: onChange => selectedRuleset.forceSync(ruleset => onChange(ruleset)),
};

/**
 * What the game hands its add-ons: its version, its own React (so an add-on bundles
 * none: the SDK's `sharedReact` reads it from `globalThis.ossIdle`), the ruleset the
 * player picked, API v2 as the signed-in player, and the editor for add-ons of the Editor type. `mount` gets an add-on's own copy, which drops
 * whatever the add-on left registered when it stops.
 */
export type AddonHost = {
	version: string,
	/** React's modules by import path: 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime' */
	react: Record<string, unknown>,
	ruleset: RulesetHost,
	api: AddonApi,
	editor: EditorHost,
};

const react = {
	react: React, 'react-dom': ReactDOM, 'react-dom/client': ReactDOMClient, 'react/jsx-runtime': jsxRuntime,
};

declare global {
	var ossIdle: AddonHost;
}

globalThis.ossIdle = {
	version: VERSION,
	react,
	ruleset: rulesetHost,
	api: addonApi,
	editor: editorHost,
};

/** One add-on's host, and what lets go of everything it registered through it. */
export const hostFor = (): { host: AddonHost, release: () => void } => {
	const owned = new Owned();
	return {
		host: {
			version: VERSION,
			react,
			ruleset: {
				current: rulesetHost.current,
				watch: onChange => owned.own(rulesetHost.watch(onChange)),
			},
			api: addonApi,
			editor: { watch: (onOpen, onClose) => owned.own(editorHost.watch(onOpen, onClose)) },
		},
		release: () => owned.release(),
	};
};
