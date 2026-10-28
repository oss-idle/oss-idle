import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { Scope } from '@oss-idle/shared/oauth';

/** What a scope lets an application do, as the consent page and the settings list it. */
export const SCOPE_TEXT: Record<Scope, MessageDescriptor> = {
	identify: msg`Identify you and read your public profile.`,
	public: msg`Read public data on your behalf.`,
	'friends.read': msg`See who you are friends with.`,
	simulate: msg`Simulate plays on your behalf.`,
};
