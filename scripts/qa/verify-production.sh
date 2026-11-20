#!/usr/bin/env bash
# Proves production serves one bundle, built from COMMIT_SHA, on both hosts.
#
# The single verification path of "Deploy myK9Show" (MYK9-2240): it runs after
# every publish AND whenever the live-commit guard reports nothing to deploy, so
# a fresh dispatch, a re-run of failed jobs and a real publish all prove the same
# thing against the same URLs.
#
#   1. MYK9-896: both hosts' build-sha.txt (cache-busted) must name COMMIT_SHA.
#   2. MYK9-546 / MYK9-2247: each host's canonical homepage `/` (what visitors
#      get) must name the entry chunk the build stamped in build-entry.txt.
#      That also proves the hosts agree, and a cached old homepage on both
#      cannot pass. A deployment without the stamp fails: rebuild_live=true.
#
#   COMMIT_SHA     required, full 40-char SHA production must serve
#   DOMAIN_URL     default https://myk9show.com
#   ALIAS_URL      default https://myk9-platform-myk9show.vercel.app
#   EXPECTED_ENTRY_FILE  optional path of the locally built build-entry.txt
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

served_stamp() {
  local body
  body="$(curl --fail --silent --location --max-time 20 "$1/build-entry.txt?v=$commit_sha-$(date +%s)-$2" 2>/dev/null)" || return 0
  tr -d '[:space:]' <<<"$body"
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

# MYK9-2247: the stamp, written at build time next to build-sha.txt, names the
# entry chunk the build produced. Each canonical homepage must serve exactly
# that chunk, so two hosts that agree on a stale cached homepage still fail.
entry_re='^src="/assets/[^"]*index-[A-Za-z0-9_-]+\.js"$'
# After a publish the workflow hands over the stamp it just wrote locally, the
# one expectation both hosts must meet; on a skip the hosts' own stamps must agree.
expected=""
if [[ -n "${EXPECTED_ENTRY_FILE:-}" && -f "$EXPECTED_ENTRY_FILE" ]]; then
  expected="$(tr -d '[:space:]' <"$EXPECTED_ENTRY_FILE")"
  [[ "$expected" =~ $entry_re ]] || {
    echo "$EXPECTED_ENTRY_FILE does not hold an entry chunk: '${expected:0:80}'" >&2
    exit 1
  }
fi
for host in "$domain" "$alias_url"; do
  stamp=""
  for ((attempt = 1; attempt <= tries; attempt += 1)); do
    stamp="$(served_stamp "$host" "$attempt")"
    # The SPA catch-all can answer a missing stamp with index.html (HTTP 200),
    # so only a complete entry chunk counts as a stamp.
    [[ "$stamp" =~ $entry_re ]] && break
    stamp=""
    if ((attempt < tries)); then sleep "$pause"; fi
  done
  [[ -n "$stamp" ]] || {
    echo "$host has no build-entry.txt stamp, so its homepage cannot be checked against the build. This deployment predates the stamp: rerun with rebuild_live=true to rebuild and republish it." >&2
    exit 1
  }
  [[ -n "$expected" ]] || expected="$stamp"
  [[ "$stamp" == "$expected" ]] || {
    echo "build stamp mismatch: $host/build-entry.txt names '$stamp', expected '$expected'. The hosts serve different builds. Rerun with rebuild_live=true to republish." >&2
    exit 1
  }
  found=""
  for ((attempt = 1; attempt <= tries; attempt += 1)); do
    found="$(entry "$host/")"
    [[ "$found" == "$expected" ]] && break
    echo "attempt $attempt: $host/ entry=$found expected=$expected"
    if ((attempt < tries)); then sleep "$pause"; fi
  done
  [[ "$found" == "$expected" ]] || {
    echo "entry chunk mismatch: $host/ serves '$found', the build produced '$expected' (a stale homepage is still being served). If this commit is already live, rerun with rebuild_live=true to republish it." >&2
    exit 1
  }
done
public="$expected"

echo "Verified: $domain and $alias_url serve $public built from $commit_sha"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "- myk9show.com serves \`$public\` built from \`$commit_sha\`" >>"$GITHUB_STEP_SUMMARY"
fi
