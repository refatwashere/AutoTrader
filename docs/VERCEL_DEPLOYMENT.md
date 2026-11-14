# Deploy AutoTrader to Vercel

This guide deploys the Next.js app from the GitHub repository. AutoTrader needs a PostgreSQL database at runtime and uses Node.js APIs for database access, encryption, and custody transactions.

## Security gate

**Do not expose this app on a public production URL or connect funded wallets yet.** The current API does not authenticate users for shared trading settings, linked wallets, and order management, and non-custody order settlement is not verified against the chain. Vercel Deployment Protection can limit access to a deployment, but it is not app-level authentication. Standard Protection leaves production domains public; protect all deployment URLs if your Vercel plan supports it, or wait to make the production URL public until the app’s authentication and transaction verification are implemented. See [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).

Use an isolated, unfunded database and test wallet for any private preview. Do not enable auto-signing or deposit funds during deployment checks.

## Before you start

- The repository is [refatwashere/AutoTrader](https://github.com/refatwashere/AutoTrader), with `main` as its production branch.
- Create a PostgreSQL database with a provider that supports Vercel. Vercel Postgres is no longer offered as a first-party database; use a current [Vercel Marketplace Postgres integration](https://vercel.com/docs/postgres) such as Neon, Supabase, or another compatible provider.
- Generate a unique 32-byte encryption key for each environment. Keep the same key for the lifetime of any custody keys encrypted with it; replacing it without re-encrypting stored keys makes those keys unreadable.
- Have a secure place to run Drizzle migrations.

## 1. Prepare the database schema

Create separate databases for Preview and Production. Avoid pointing Preview deployments at the Production database.

The repository contains a Drizzle schema but no generated migration history yet. From a trusted local checkout, configure `DATABASE_URL` for a development database, install dependencies, and generate the initial migration:

```sh
npm install
npm run db:generate
```

Review the generated SQL under `drizzle/`, then commit the migration files. Apply migrations to the target database with `npm run db:migrate` before sending traffic to the deployment. Run migrations once per database from a controlled deployment step; do not run them from `next build`, which can run multiple times and for Preview builds.

For Vercel, use a pooled PostgreSQL connection URL for runtime traffic when the database provider offers one. Keep migrations on the provider’s direct or migration connection URL when required. Vercel documents connection pooling for functions [here](https://vercel.com/kb/guide/connection-pooling-with-functions). Place the Vercel Function region close to the database to reduce latency ([Function regions](https://vercel.com/docs/functions/configuring-functions/region)).

## 2. Import the repository

1. In Vercel, choose **Add New → Project** and import `refatwashere/AutoTrader`.
2. Set **Root Directory** to the repository root. Leave the Framework Preset set to **Next.js**.
3. Use the default install and build settings. The build command is `npm run build`; the output directory should remain the Next.js default.
4. Set the Node.js version to **20.x or newer** (the project declares Node.js `>=20.9.0` in `package.json`).
5. Keep `main` as the Production Branch. Vercel creates Preview deployments for other branches and Production deployments for updates to the configured production branch ([Git deployments](https://vercel.com/docs/git)).

No `vercel.json` file is required for the default Next.js build.

## 3. Configure environment variables

In **Project → Settings → Environment Variables**, add the following values. Select the intended environment explicitly; Preview and Production variables are separate, and changes apply to new deployments ([Vercel environment variables](https://vercel.com/docs/environment-variables)).

| Name | Value | Environment |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL URL for the matching database. Map the provider’s pooled runtime URL to this exact name if it uses another variable name. | Preview and Production, using different databases |
| `CUSTODY_ENCRYPTION_KEY` | Unique 64-character hexadecimal key generated securely for this environment. | Production; add a different key to Preview only if testing custody there |
| `BASE_RPC_URL` | Optional Base RPC URL. If omitted, the app uses `https://mainnet.base.org`. | As needed |

Do not prefix secrets with `NEXT_PUBLIC_`; that prefix exposes values to browser code. Never paste secret values into GitHub, this guide, build commands, or logs. Keep `.env.production.local` and other environment files out of source control; `.gitignore` excludes them.

When a database Marketplace integration injects a variable such as `POSTGRES_URL`, either configure the integration to provide `DATABASE_URL` or add `DATABASE_URL` in Vercel and map it to the correct provider value. The app reads `DATABASE_URL` directly.

## 4. Deploy a private Preview

Push a non-production branch or open a pull request. Wait for Vercel’s Preview deployment, then keep it protected with Vercel Authentication. Use only the Preview database and non-funded test wallet. Verify:

1. The build completes.
2. `/api/health` returns `{"ok":true}` after the Preview database migration has been applied.
3. The dashboard loads and database-backed actions work with the test database.
4. No secret values are present in browser responses, source maps, or build logs.

Preview URLs may otherwise be accessible to anyone with the URL. Configure access in **Project → Settings → Deployment Protection** and confirm which deployment scopes the selected plan protects ([protection details](https://vercel.com/docs/deployment-protection)).

## 5. Production rollout

Do not make the production URL public until the security gate above is cleared. When it is:

1. Confirm Production variables point only to the Production database and Production encryption key.
2. Apply reviewed database migrations to Production using a controlled migration step.
3. Merge the reviewed change into `main` and wait for the Production deployment to become Ready.
4. Check `/api/health`, inspect Vercel runtime logs, and verify the app against an unfunded wallet first.
5. Keep auto-signing disabled until authentication, ownership checks, chain receipt verification, and risk limits have been reviewed against the live deployment.

Git-connected projects deploy automatically when changes reach their configured production branch; use Preview deployments to review changes before that point ([Vercel Git deployments](https://vercel.com/docs/git)).

## Troubleshooting

- **`DATABASE_URL is required`** — add the variable in Vercel for the deployment environment and redeploy.
- **Database connection failures or timeouts** — check the connection URL, provider network access, pooler URL, and that the selected Function region is near the database.
- **`/api/health` is not healthy** — confirm migrations have been applied to the database used by that environment.
- **Preview works but Production fails** — compare variable names and environment scopes. Preview variables do not automatically become Production variables.
- **Custody key decryption errors** — verify `CUSTODY_ENCRYPTION_KEY` matches the key used to encrypt the stored custody wallet. Do not replace it casually.

## References

- [Deploying Git repositories](https://vercel.com/docs/git)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Postgres integrations](https://vercel.com/docs/postgres)
- [Function regions](https://vercel.com/docs/functions/configuring-functions/region)
- [Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Connection pooling with Vercel Functions](https://vercel.com/kb/guide/connection-pooling-with-functions)
