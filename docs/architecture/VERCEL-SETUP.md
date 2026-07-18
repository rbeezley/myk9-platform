# Vercel Deployment Setup

## Projects

| App | Vercel Project | Root Directory | Primary URL |
|-----|---------------|----------------|-------------|
| myK9Show | `myk9-platform-myk9show` | `apps/myk9show` | myk9-platform-myk9show.vercel.app |
| Guides | `myk9-platform-myk9show-guides` | `apps/docs` | help.myk9show.com |

myK9Show and the guides deploy from `rbeezley/myk9-platform`. During pre-launch, myK9Show `main` Git auto-deploy is enabled so merges update `myk9show.com`; PR preview deployments remain enabled. The launch-ready path promotes exact validated SHAs through protected `staging-release` and `guides-release` refs and releases production only through the explicit [`Release Production`](../../.github/workflows/deploy-production.yml) workflow. See [`ci-vercel-deploys.md`](../operations/ci-vercel-deploys.md). (Ringside scoring lives inside myK9Show at `/at-show`; the former standalone `apps/myk9q` app — and its `myk9-platform-myk9q` Vercel project — have been removed.)

For Hobby-tier preview quota controls, keep Vercel preview checks non-required in GitHub and verify monorepo skip-unaffected project behavior for both projects. See [`vercel-preview-quota.md`](../operations/vercel-preview-quota.md).

**Note:** The standalone `my-k9-q-react` Vercel project (legacy separate repo) remains untouched and serves production at myk9q.com.

## Environment Variables

### Shared (both apps)

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://sojmvhhwsjxmfistvzbe.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | From myk9-platform Supabase dashboard (Project Settings → API → anon public key) |

### myK9Show additional

| Variable | Value |
|----------|-------|
| `VITE_APP_ENVIRONMENT` | `staging` |

### Production configuration

Production must use a separate Vercel environment configuration and Supabase
project. Populate the production project’s `VITE_SUPABASE_URL`, anon key, and
`VITE_APP_ENVIRONMENT=production` independently; do not copy staging values into
the production project. The repository does not store either environment’s
secret values.

## Build Configuration

myK9Show uses a Turborepo build command configured in its `vercel.json`:

- **myK9Show:** `cd ../.. && npx turbo build --filter=@myk9/show`

Framework preset: Vite. Output directory: `dist`.

## Creating a New Project

1. Go to vercel.com/new
2. Import `rbeezley/myk9-platform`
3. Set **Root Directory** to the app directory (e.g., `apps/myk9show`)
4. Set **Framework Preset** to Vite
5. Add environment variables (see above)
6. Click Deploy
