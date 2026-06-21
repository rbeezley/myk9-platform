# Vercel Deployment Setup

## Projects

| App | Vercel Project | Root Directory | Staging URL |
|-----|---------------|----------------|-------------|
| myK9Show | `myk9-platform-myk9show` | `apps/myk9show` | myk9-platform-myk9show.vercel.app |

myK9Show deploys from `rbeezley/myk9-platform`. Today, pushes to `main` trigger production deployments via Vercel's Git integration and PRs get preview deployments. **Production deploys are moving to CI-gated** (rollout pending — see [`ci-vercel-deploys.md`](../operations/ci-vercel-deploys.md)): once the `VERCEL_*` secrets are added and `git.deploymentEnabled.main` is set to `false`, the [`Deploy Production`](../../.github/workflows/deploy-production.yml) workflow becomes the sole production path and ships `main` only after the `CI` workflow passes; PR previews are unaffected. (Ringside scoring lives inside myK9Show at `/at-show`; the former standalone `apps/myk9q` app — and its `myk9-platform-myk9q` Vercel project — have been removed.)

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
