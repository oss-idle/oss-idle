import '../../pages/bot/BotPage.css';

import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';

import { getBotMatch } from '../../api/botMatch';
import Link from '../../components/Link';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import BotResult from '../../pages/bot/BotResult';
import BotShare from '../../pages/bot/BotShare';

export const Route = createFileRoute('/bot/$userId')({
	loader: ({ params }) => getBotMatch(params.userId),
	component: SharedBot,
	staticData: { title: msg`bot match` },
});

function SharedBot() {
	const { result, ranks } = Route.useLoaderData();
	const { userId } = Route.useParams();
	const user = useCurrentUser();
	return <div className='bot'>
		<BotResult result={result} ranks={ranks}>
			<div className='bot-controls'>
				{String(user?.id) !== userId && <Link to='/bot' className='bot-button is-main'>
					<Trans>Find your oss!idle skillset</Trans>
				</Link>}
				<BotShare link={location.href} />
			</div>
		</BotResult>
	</div>;
}
