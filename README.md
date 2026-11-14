# AutoTrader

**Developer:** Robiul Islam Refat  
**GitHub:** [github.com/refatwashere](https://github.com/refatwashere)  
**Email:** [rbl.islam.refat2@gmail.com](mailto:rbl.islam.refat2@gmail.com)

AutoTrader is a Next.js trading terminal with a PostgreSQL-backed paper trading engine, live order intents, wallet linking, and an optional Base custody vault.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- npm

## Local setup

1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to your database. Set `CUSTODY_ENCRYPTION_KEY` to a fresh 64-character hexadecimal key before creating a custody vault.
3. Install dependencies with `npm install`.
4. Generate and apply the Drizzle migrations:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

5. Start the development server:

   ```sh
   npm run dev
   ```

The app is available at `http://localhost:3000`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by the app and Drizzle Kit. |
| `CUSTODY_ENCRYPTION_KEY` | For custody | 32-byte key encoded as 64 hexadecimal characters. Back it up securely; losing it makes stored custody keys unrecoverable. |
| `BASE_RPC_URL` | No | Base network RPC URL. Defaults to the public Base RPC endpoint. |

Never commit `.env`, production credentials, wallet private keys, or database dumps. `.env.example` is a template and contains no production secrets.

## Available commands

- `npm run dev` — start Next.js in development mode
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint
- `npm run typecheck` — run TypeScript checks
- `npm run db:generate` — generate migrations from the Drizzle schema
- `npm run db:migrate` — apply pending migrations

## Security status

This project does not yet implement application-level authentication for its shared trading configuration, linked wallet records, and live-order management APIs. Wallet ownership signatures prove control of a wallet, but they do not authenticate a user to the app. Do not expose a deployed instance to the public internet or use it with funded wallets until those APIs are protected by an appropriate authentication and authorization layer and live transaction settlement is verified on-chain.

The custody vault uses a separate, random browser session cookie and encrypts private keys with `CUSTODY_ENCRYPTION_KEY`. This does not replace application authentication for the other APIs. Use a dedicated database, keep encryption keys outside source control, and treat custody key backups as sensitive secrets.

## Database schema

The Drizzle schema is in `src/db/schema.ts`; migration files are generated into the project’s migrations directory. Review migrations before applying them to a production database.
