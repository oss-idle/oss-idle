import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';

import BotPage from '../../pages/bot/BotPage';

export const Route = createFileRoute('/bot/')({
	component: BotPage,
	staticData: { title: msg`your skillset` },
});
