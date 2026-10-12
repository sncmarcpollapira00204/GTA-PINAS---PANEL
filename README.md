# GTA Pinas Web Panel

A Discord-authenticated staff panel for **GTA Pinas Roleplay**. This repository contains the panel only; the Discord bot runs separately in the [GTA-Pinas-Bot repository](https://github.com/sncmarcpollapira00204/GTA-Pinas-Bot).

## Security and visibility

This repository is currently public. Make it private if you do not intentionally publish the panel source. A public repo exposes committed code and history to anyone. The `.env.example` file should contain placeholders only, never actual credentials.

If any real Discord token, OAuth secret, database URL, or session secret has ever been committed, rotate/revoke it with its provider; deleting it from the latest commit is not enough.

## Hosting environment

Use Node.js 20 and start the panel with:

```bash
npm ci
npm start
```

Configure these values in the hosting provider's environment-variable settings, not in source control:

Required:
- `DATABASE_URL` — PostgreSQL connection used by the panel and, if sharing ticket data, the bot.
- `DISCORD_TOKEN` — bot token used for server-side Discord lookups.
- `DISCORD_CLIENT_ID` — Discord OAuth2 application ID.
- `DISCORD_CLIENT_SECRET` — Discord OAuth2 client secret.
- `DISCORD_REDIRECT_URI` — exact HTTPS callback URL registered in Discord Developer Portal.
- `DISCORD_GUILD_ID` — GTA Pinas Discord server ID.
- `PANEL_ALLOWED_ROLE_IDS` — comma-separated allowed staff role IDs.
- `SESSION_SECRET` — long, random secret of at least 32 characters.

Recommended:
- `COOKIE_SECURE=true`
- `NODE_ENV=production`
- `PUBLIC_URL` — public HTTPS panel URL
- `SESSION_HOURS=8`
- `ACCESS_RECHECK_MINUTES=10`

Review `.env.example` for the complete set of supported variables.

## Discord OAuth2

Register the same URL as `DISCORD_REDIRECT_URI` in Discord Developer Portal OAuth2 Redirects. Example:

```text
https://YOUR-PANEL-DOMAIN/auth/discord/callback
```

Do not use that example literally; replace it with the panel's actual HTTPS domain.

## Database

The bot and panel can share a PostgreSQL database when features require it. Use the same `DATABASE_URL` only in services that need access, and do not create a second ticket database just for the panel.

## Verification

Before deploying panel changes:

```bash
npm run verify
```

For bot-only hosting, deploy the separate bot repository as a persistent worker; the panel is not required.
