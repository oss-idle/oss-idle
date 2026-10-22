![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Foss-idle%2Foss-idle%2Fmain%2Fpackage.json&query=%24.version&label=version&color=ff66aa)
[![CI](https://github.com/oss-idle/oss-idle/actions/workflows/ci.yml/badge.svg)](https://github.com/oss-idle/oss-idle/actions/workflows/ci.yml)
[![AGPLv3 License](https://img.shields.io/badge/License-AGPL%20v3-yellow.svg)](https://opensource.org/licenses/)
[![CodeFactor](https://www.codefactor.io/repository/github/oss-idle/oss-idle/badge)](https://www.codefactor.io/repository/github/oss-idle/oss-idle)
[![Crowdin](https://badges.crowdin.net/oss-idle/localized.svg)](https://crowdin.com/project/oss-idle)
![GitHub contributors](https://img.shields.io/github/contributors/oss-idle/oss-idle)
![GitHub last commit](https://img.shields.io/github/last-commit/oss-idle/oss-idle)
[![oss!idle discord](https://discordapp.com/api/guilds/1511463564135759954/widget.png?style=shield)](https://oss.idle.rhythmgamers.net/discord)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/web/public/idle-white.png" />
    <img src="packages/web/public/idle-black.png" alt="oss!idle" width="400" />
  </picture>
</p>

# oss!idle

An osu!mania idle game where you train your own character on actual maps.

**Play it at [oss.idle.rhythmgamers.net](https://oss.idle.rhythmgamers.net)**, in the
browser or with the desktop app. Sign in with your osu! account to get on the
rankings. Not affiliated with osu! or ppy Pty Ltd.

## What's in this repo

An npm workspaces monorepo:

| Package | |
|---|---|
| `packages/shared` | Wire types, the mania simulation (how a character plays a map), skills, pp |
| `packages/server` | The API (Hono, MySQL/MariaDB through drizzle, Redis), osu! sign-in, server-side scoring |
| `packages/client` | The game (React + Vite) |
| `packages/web` | Profiles, rankings, maps, news (React + Vite, TanStack Router), served under `/web` |
| `packages/desktop` | The Electron app |
| `packages/discord` | The Discord bot for level roles |
| `packages/tests` | Vitest suite |
| `packages/e2e` | Playwright suite, run against the dev stack |

## Running it locally

You need Node 22+, MariaDB (or MySQL 8) and Redis.

```bash
npm ci
cp packages/server/.env.example packages/server/.env
```

Fill in `packages/server/.env`:

- `DB_*`: an empty database for `DB_NAME_DEV`. Then create the tables with `npm run migrate`.
- `JWT_SECRET`: any long random string.
- `OSU_CLIENT_ID` / `OSU_CLIENT_SECRET`: an OAuth application from your
  [osu! account settings](https://osu.ppy.sh/home/account/edit#oauth), with
  `http://localhost:3873/v1/auth/osu/callback` as its callback. Only needed to sign in;
  guest play works without it.
- `OSU_SCHEDULER_TOKEN`: osu! API calls go through a
  [scheduler](https://github.com/Adrriii/osu-api-scheduler). Any value lets the server
  start; map requests can't be checked against osu! without a real one.
- The rest is optional and says so in the file.

```bash
npm run dev
```

The game is at http://localhost:5173 and the web platform at http://localhost:5173/web.
Maps are added by an admin (`ADMIN_USER_IDS` in `packages/shared/src/admin.ts`, osu! user
ids) by uploading an `.osz` on `/web/admin/nomination`, then ranking it there.

## Checks

```bash
npm run lint:fix   # tabs, semicolons, single quotes
npm test           # the vitest suite
npm run teste2e    # the browser suite, against `npm run dev` (once: npm run teste2e:install)
```

CI runs the typecheck, lint, tests and the client/web builds on every push and pull request.

## Self-hosting

The production setup is the one running oss.idle.rhythmgamers.net: the server under
pm2 with `NODE_ENV=production` (`npm -w @oss-idle/server run start:prod`), behind a
reverse proxy that also forwards the `/v1/ws` WebSocket, and the built `client` and
`web` bundles served as static files. Its hostnames live in
`packages/server/src/env.ts` and the `.env.production` files of the client and web,
so change those for your own domain.

## Translations

Translations are on [Crowdin](https://crowdin.com/project/oss-idle). Write new strings in
English in the code; they are picked up from there.

```sh
# upload new english strings
npm run i18n:upload
# pull updated translations
npm run i18n:download
```

## License

[AGPL-3.0](LICENSE)

The default exit sound (`packages/client/public/skins/default/seeya.mp3`) is osu!'s seeya from
[ppy/osu-resources](https://github.com/ppy/osu-resources), (c) ppy Pty Ltd, licensed
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
