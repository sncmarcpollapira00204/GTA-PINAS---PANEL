# GTA Pinas Web Panel

A Discord-authenticated staff panel for **GTA Pinas Roleplay**. The panel reads ticket data from the same PostgreSQL database used by `GTA-Pinas-Bot` and keeps the existing panel HTML/UI design.

## What the panel provides

- Discord OAuth2 staff login
- Dashboard ticket statistics
- Open and closed ticket views
- Ticket details and transcript viewing
- Staff profiles and staff performance
- Access logs
- Staff-management controls for authorized users
- Panel media/settings controls

Legacy whitelist, import/recovery, school-ticket, and backup-center modules are no longer part of the active panel.

## Railway environment

Copy `.env.example` into the Web Panel service variables and set the real values.

Required:

```text
DATABASE_URL=<same PostgreSQL connection used by GTA-Pinas-Bot>
DISCORD_TOKEN=<bot token>
DISCORD_CLIENT_ID=<Discord OAuth2 application client ID>
DISCORD_CLIENT_SECRET=<Discord OAuth2 application client secret>
DISCORD_REDIRECT_URI=https://YOUR-WEB-PANEL-DOMAIN/auth/discord/callback
DISCORD_GUILD_ID=1525392083924549682
PANEL_ALLOWED_ROLE_IDS=<comma-separated allowed staff role IDs>
PANEL_ALLOWED_USER_IDS=<comma-separated allowed Discord user IDs, optional>
SESSION_SECRET=<long random secret, 32+ characters>
COOKIE_SECURE=true
NODE_ENV=production
```

Optional:

```text
PUBLIC_URL=https://YOUR-WEB-PANEL-DOMAIN
SESSION_HOURS=8
ACCESS_RECHECK_MINUTES=10
MEDIA_STORAGE_DIR=<persistent Railway volume path, optional>
```

## Discord OAuth2

In the Discord Developer Portal, add this exact callback URL to the OAuth2 Redirects list:

```text
https://YOUR-WEB-PANEL-DOMAIN/auth/discord/callback
```

The panel uses the OAuth2 `identify` and `guilds.members.read` scopes.

## Database

`GTA-Pinas-Bot` and this panel should point at the same PostgreSQL service when you want the panel to show the bot's ticket records.

Do not create a second ticket database for the panel.

## Deploy

Use Node.js 20 and the existing start command:

```text
npm start
```

For a verification pass:

```text
npm run verify
```

<!-- Railway redeploy marker: stable rollback -->
