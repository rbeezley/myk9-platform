# Vercel Deployment Setup

## myk9show

1. Go to **vercel.com/new**
2. **Import Git Repository** → select `rbeezley/myk9-platform`
3. Configure the project:
   - **Project Name:** `myk9show`
   - **Framework Preset:** Vite
   - **Root Directory:** click "Edit" and set to `apps/myk9show`
4. Expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = `https://sojmvhhwsjxmfistvzbe.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key (find it in the Supabase dashboard under Project Settings → API → `anon` `public` key)
5. Click **Deploy**

The build command and output directory are auto-detected from `apps/myk9show/vercel.json`. After the first deploy, every push to `main` triggers an automatic production deployment, and PRs get preview deployments.

## myk9q (standalone production)

The existing Vercel project `my-k9-q-react` is the **production standalone myk9q**. Do not modify it. When ready to transition to the monorepo version, create a new project following the same steps as myk9show but with:

- **Root Directory:** `apps/myk9q`
- The existing `apps/myk9q/vercel.json` handles SPA rewrites and security headers
