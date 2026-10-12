# Security and deployment notes

This is the GTA Pinas staff web panel. The Discord bot can run without this web panel.

## Public repository warning

Keep this repository private unless the source is intentionally public. Never commit real deployment values such as `DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, or `SESSION_SECRET`. The `.env.example` should contain names and safe placeholders only.

If a real credential was ever committed to a public repository, assume it may have been copied: rotate/revoke it at the issuing provider first. Removing it in a later commit does not make the old credential safe.

## Panel hosting

The panel is a long-running Node.js 20 Express service. Set its runtime environment variables in the hosting provider's secret/environment settings, and use the service's assigned HTTPS URL for the Discord OAuth callback. Restrict staff access with explicit allowed role IDs and/or user IDs, and use a strong random SESSION_SECRET.

## No-panel bot hosting

For bot-only hosting, deploy the GTA-Pinas-Bot repository as a persistent Node.js process:
- Build/install: `npm ci`
- Start: `npm start`
- Runtime: Node.js 20
- Set `DISCORD_TOKEN` and `APPLICATION_ID` as environment variables; set `DATABASE_URL` and AI keys only where needed.
