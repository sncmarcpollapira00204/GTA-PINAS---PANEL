# Backup Center connection setup

The Web Panel now asks the Main Bot to perform the same full operation used by `/gatekeeperbackup` and `/cleardatabase`.

## 1. Create one private secret

Generate a long random value. Use the exact same value in both Railway services.

Recommended minimum: 32 random characters.

Do not place this value in source code or Discord messages.

## 2. Main Bot Railway variables

Add:

```text
MAIN_BOT_CONTROL_SECRET=<your-private-random-secret>
```

The Main Bot starts its protected HTTP control service on Railway's assigned `PORT`.

## 3. Web Panel Railway variables

Add:

```text
MAIN_BOT_CONTROL_URL=<Main Bot internal or HTTPS service URL>
MAIN_BOT_CONTROL_SECRET=<the-same-private-random-secret>
```

Use Railway private networking when both services can reach each other internally. Otherwise use the Main Bot's HTTPS service URL.

## 4. Redeploy order

1. Redeploy `MAIN-BOT`.
2. Confirm its `/health` endpoint reports `status: ok`.
3. Redeploy `WEB-PANEL`.
4. Sign in as the configured Panel Owner.
5. Open **Management → Backup Center**.
6. Press **Refresh Status**.

## Security behavior

- Full backup and database-clear endpoints require the shared secret.
- The Main Bot also verifies the Panel Owner Discord user ID.
- The Web Panel routes are protected by Discord login, owner middleware, and CSRF checks.
- Clear Databases still requires typing `DELETE ALL DATABASES` and checking the acknowledgement box.
- Backup files expire from the Main Bot's temporary storage after two hours.
