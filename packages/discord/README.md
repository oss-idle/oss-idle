# @oss-idle/discord

The oss!idle Discord bot. It gives every member who linked their Discord account
(Options → Sign in → *Link Discord account*) a role for their current
character's overall level: `Level 10+` .. `Level 90+` every 10 levels, then one
per level from 100 (`Level 100`, `Level 101`, ...). Those take the site's level
colours from `shared.css`; the ones below fade from Discord gray up to the
level 100 colour. Roles are hoisted, highest on top, made the first time someone
reaches them and deleted once nobody holds them.

Linked team members also get their group's role (`Administrators`, `Global
Moderation Team`) and supporters a `Supporter` one, in the site's colours. They
sit right above the level roles so their colour wins, but aren't hoisted, so the
member list still groups by level. Any other role found among them or the level
roles (like the map ping roles) is moved under the level roles; a role placed above
the whole block stays there. The bot makes them on start and takes them
from anyone it doesn't find in the group or with an active tag. `Global
Moderation Team` also carries moderation permissions (kick, ban, timeout,
manage messages/threads/nicknames, voice mute/deafen/move, audit log) but not
*Manage Roles*, so moderators can't hand out levels or Supporter. A supporter who ticks the
option under *Link Discord account* gets `Supporter (level colour)` instead, a role with no
colour, so their level's colour shows.

It also sets each linked member's server nickname to their current character's
name (not the owner's, or anyone ranked above the bot: Discord forbids it), followed by ` ♥`
for a supporter when it fits Discord's 32 characters. Role icons would need more server boosts.

- **Live:** it listens to the server's socket hub on Redis, so a play, a rebirth
  or a fresh link moves the roles at once. A full pass every 15 minutes and on
  start catches the rest (unlinks, relinks, missed events).
- **Config:** reads `packages/server/.env` - the DB/Redis settings plus
  `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID`. The server needs
  `DISCORD_CLIENT_SECRET` for the linking itself.
- **Discord side:** Server Members intent on, the bot invited with *Manage
  Roles*, *Manage Nicknames* plus every permission it gives the GMT role (Discord only lets it
  grant what it holds), and its own `oss!idle` role at the top of the role list - it can only
  order roles below its own.

## Running

Prod runs it as its own long-lived service (`node --import tsx src/index.ts` from this
package, `NODE_ENV=production`), restarted along with the API on each deploy.

It is not part of `npm run dev`: there is one Discord server, and a dev bot
reading the staging database would hand out staging levels there. To try it
locally anyway, stop the prod one first: `npm -w @oss-idle/discord start`.
