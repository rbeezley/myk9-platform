#!/usr/bin/env bash
# Proves production serves one bundle, built from COMMIT_SHA, on both hosts.
#
# The single verification path of "Deploy myK9Show" (MYK9-2240): it runs after
# every publish AND whenever the live-commit guard reports nothing to deploy, so
# a fresh dispatch, a re-run of failed jobs and a real publish all prove the same
# thing against the same URLs.
#
#   1. MYK9-546: myk9show.com once served a bundle days behind the default
#      alias, so both homepages (canonical `/`, what visitors get) must name
#      the same non-empty entry chunk.
#   2. MYK9-896: a chunk comparison cannot tell an old build from a new one, so
#      both hosts' build-sha.txt (cache-busted) must name COMMIT_SHA.
#
#   COMMIT_SHA     required, full 40-char SHA production must serve
#   DOMAIN_URL     default https://myk9show.com
#   ALIAS_URL      default https://myk9-platform-myk9show.vercel.app
#   VERIFY_TRIES   attempts per check (default 6)
#   VERIFY_SLEEP   seconds between attempts (default 10)
#
# Appends a line to $GITHUB_STEP_SUMMARY when set; exits 1 on any mismatch.
set -euo pipefail

commit_sha="${COMMIT_SHA:-}"
domain="${DOMAIN_URL:-https://myk9show.com}"
alias_url="${ALIAS_URL:-https://myk9-platform-myk9show.vercel.app}"
tries="${VERIFY_TRIES:-6}"
pause="${VERIFY_SLEEP:-10}"

[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "COMMIT_SHA must be a full 40-character SHA (got '$commit_sha')" >&2
  exit 1
}

# Read the whole page before matching: `curl | grep | head` can SIGPIPE curl,
# which pipefail turns into a failed step.
# Output from a failed or timed-out transfer (curl exits non-zero after
# printing part of the body) is discarded, never parsed.
entry() {
  local html
  html="$(curl --fail --silent --show-error --location --max-time 20 "$1")" || return 0
  grep -oE 'src="/assets/[^"]*index-[A-Za-z0-9_-]+\.js"' <<<"$html" | sort -u || true
}

served_sha() {
  local body
  body="$(curl --fail --silent --location --max-time 20 "$1/build-sha.txt?v=$commit_sha-$(date +%s)-$2" 2>/dev/null)" || return 0
  tr -d '[:space:]' <<<"$body"
}

public=""
for ((attempt = 1; attempt <= tries; attempt += 1)); do
  default_alias="$(entry "$alias_url/")"
  public="$(entry "$domain/")"
  [[ -n "$public" && "$default_alias" == "$public" ]] && break
  echo "attempt $attempt: $alias_url/ entry=$default_alias $domain/ entry=$public"
  if ((attempt < tries)); then sleep "$pause"; fi
done
[[ -n "$public" && "$default_alias" == "$public" ]] || {
  echo "entry chunk mismatch: $alias_url/ serves '$default_alias', $domain/ serves '$public'. If this commit is already live, rerun with rebuild_live=true to republish it." >&2
  exit 1
}

for host in "$domain" "$alias_url"; do
  served=""
  for ((attempt = 1; attempt <= tries; attempt += 1)); do
    served="$(served_sha "$host" "$attempt")"
    [[ "$served" == "$commit_sha" ]] && break
    echo "attempt $attempt: $host/build-sha.txt=${served:0:60} expected=$commit_sha"
    if ((attempt < tries)); then sleep "$pause"; fi
  done
  [[ "$served" == "$commit_sha" ]] || {
    echo "$host serves commit '${served:0:60}', expected $commit_sha" >&2
    exit 1
  }
done

echo "Verified: $domain and $alias_url serve $public built from $commit_sha"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "- myk9show.com serves \`$public\` built from \`$commit_sha\`" >>"$GITHUB_STEP_SUMMARY"
fi
