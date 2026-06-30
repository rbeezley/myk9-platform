# Site-Admin MCP — Local Setup

> **Status:** Reference

`@myk9/admin-mcp` is a **local, read-only, site-admin-only** MCP server. It lets an AI client (Claude Code / Codex) answer myK9-aware diagnostic questions about your data without turning Supabase into a raw SQL chat surface. It is **not** for exhibitors, secretaries, or any hosted/public client.

## What it does (V1.0)

Three cross-table diagnostics, each returning a typed, redacted result with the database it ran against (`envLabel`) stamped on every answer:

| Tool | Answers |
| --- | --- |
| `diagnose_confirmation_email` | Why an entry did/didn't get its confirmation email (entry record cross-checked against `email_log`). |
| `diagnose_payment` | Payment state for an entry (by id) or a Stripe payment-intent / checkout-session id. |
| `list_show_access` | Who has secretary/admin-style access to a show (show-scoped **and** club-scoped roles), each labeled active/inactive/expired. |

Lookup tools (`lookup_show`, `lookup_entry`, …) are deferred to V1.1 — in V1.0 you source entry/show ids via the generic Supabase MCP or the app UI, then feed them to a diagnostic.

V1.0 is **read-only**. There are no create/update/delete/refund/publish/email-send/role-grant tools.

## Required environment variables

| Var | Purpose |
| --- | --- |
| `MYK9_MCP_SUPABASE_URL` | Supabase project URL (http/https). |
| `MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY` | Service-role key (see the security warning below). |
| `MYK9_MCP_APP_BASE_URL` | myK9Show base URL, used to build deep links (e.g. `https://myk9-platform-myk9show.vercel.app`). |
| `MYK9_MCP_ENV_LABEL` | One of `local` / `staging` / `production` — stamped onto every answer so you always know which DB it came from. |

Optional: `MYK9_MCP_DEFAULT_LIMIT` (default 25) and `MYK9_MCP_MAX_LIMIT` (default 50, hard-capped at 100). The server **fails closed** — it refuses to start if any required var is missing or malformed.

> ⚠️ **The service-role key bypasses RLS and grants full database access.** Run this server **only on your own trusted machine**, never on a shared host, CI, Vercel, or a Supabase Edge Function. Do not commit the key, a `.env` containing it, logs of query results, or any MCP config with the literal key in it.

## Run it

```bash
pnpm mcp:admin        # runs the server over stdio (tsx)
pnpm mcp:admin:test   # package tests
pnpm mcp:admin:build  # typecheck + build
```

## Wire it into your AI client (local config — do not commit)

This server is owner-only, so add it to **your personal MCP client config**, not a repo-committed `.mcp.json` (a committed entry would push a service-role server onto every contributor). Use `${VAR}` placeholders so no secret is written into the file — set the real values in your shell environment.

Claude Code (`claude mcp add`, or your user-level config):

```jsonc
{
  "mcpServers": {
    "myk9-admin": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/myk9-platform", "mcp:admin"],
      "env": {
        "MYK9_MCP_SUPABASE_URL": "${MYK9_MCP_SUPABASE_URL}",
        "MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY": "${MYK9_MCP_SUPABASE_SERVICE_ROLE_KEY}",
        "MYK9_MCP_APP_BASE_URL": "${MYK9_MCP_APP_BASE_URL}",
        "MYK9_MCP_ENV_LABEL": "${MYK9_MCP_ENV_LABEL}"
      }
    }
  }
}
```

> **Editing a committed `.mcp.json` is not a docs-only change** — per `CLAUDE.md` it requires a PR. The recommended setup above avoids that entirely by living in your personal config.

## Example questions

- "Diagnose the confirmation email for entry `<uuid>`."
- "Diagnose the payment for entry `<uuid>`" (or "for payment intent `pi_…`").
- "Who has access to show `<uuid>`?"

## Disable it

Remove (or comment out) the `myk9-admin` block from your MCP client config and restart the client. There is no database migration or deploy to undo — the server is a local process only.

## Relationship to the generic Supabase MCP

The generic Supabase MCP still exists for schema/table/SQL work. This server is the **myK9-aware** layer: it answers in business terms (confirmation email, payment, show access) with redaction and deep links, rather than returning raw rows. Use the generic MCP to find ids; use this to diagnose.
