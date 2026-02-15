# Vercel Deployment Setup

## Projects

| App | Vercel Project | Root Directory | Staging URL |
|-----|---------------|----------------|-------------|
| myK9Show | `myk9-platform-myk9show` | `apps/myk9show` | myk9-platform-myk9show.vercel.app |
| myK9Q (monorepo) | `myk9-platform-myk9q` | `apps/myk9q` | myk9-platform-myk9q.vercel.app |

Both projects deploy from `rbeezley/myk9-platform`. Pushes to `main` trigger production deployments. PRs get preview deployments.

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

### myK9Q (monorepo) additional

| Variable | Value |
|----------|-------|
| `VITE_ENVIRONMENT` | `staging` |

## Build Configuration

Both apps use Turborepo build commands configured in their respective `vercel.json` files:

- **myK9Show:** `cd ../.. && npx turbo build --filter=@myk9/show`
- **myK9Q:** `cd ../.. && npx turbo build --filter=@myk9/q`

Framework preset: Vite. Output directory: `dist`.

## Creating a New Project

1. Go to vercel.com/new
2. Import `rbeezley/myk9-platform`
3. Set **Root Directory** to the app directory (e.g., `apps/myk9show`)
4. Set **Framework Preset** to Vite
5. Add environment variables (see above)
6. Click Deploy
