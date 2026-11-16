import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';

import TwitchLinked from '../../pages/TwitchLinked';

export const Route = createFileRoute('/auth/twitch')({
	component: TwitchLinked,
	staticData: { title: msg`Twitch linked` },
});
