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
#      The stamps must agree across hosts and each homepage must match its
#      host's stamp, so a cached old homepage on both cannot pass. When this job
#      published, they must also equal the published stamp (MYK9-2306).
#      A deployment without the stamp fails: rebuild_live=true.
#
#   COMMIT_SHA     required, full 40-char SHA production must serve
#   DOMAIN_URL     default https://myk9show.com
#   ALIAS_URL      default https://myk9-platform-myk9show.vercel.app
#   EXPECTED_ENTRY_FILE  set only when this job published: the built build-entry.txt
#   VERIFY_TRIES   attempts per check (default 6)
#   VERIFY_SLEEP   seconds between attempts (default 10)
#
# Appends a line to $GITHUB_STEP_SUMMARY when set; exits 1 on any mismatch,
# 2 when a stamp could not be read (transport error: retry, never republish).
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

# Reads a host's build-entry.txt. Sets STAMP (the well-formed stamp, or "") and
# STAMP_STATE: ok, missing (HTTP 4xx, or a body that is not a complete entry
# chunk such as the SPA catch-all's index.html) or transport (timeout, DNS or
# connection failure, 5xx). Only `missing` means the deployment lacks the stamp.
STAMP=""
STAMP_STATE=""
read_stamp() {
  local out code body
  STAMP=""
  STAMP_STATE="transport"
  out="$(curl --silent --location --max-time 20 --write-out $'\n%{http_code}' "$1/build-entry.txt?v=$commit_sha-$(date +%s)-$2" 2>/dev/null)" || return 0
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    body="$(tr -d '[:space:]' <<<"$body")"
    if [[ "$body" =~ $entry_re ]]; then
      STAMP="$body"
      STAMP_STATE="ok"
    else
      STAMP_STATE="missing"
    fi
  elif [[ "$code" =~ ^4[0-9][0-9]$ ]]; then
    STAMP_STATE="missing"
  fi
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

# MYK9-2247 / MYK9-2306: the stamp, written at build time next to build-sha.txt,
# names the entry chunk the build produced. Both stamps must be well-formed (the
# SPA catch-all can answer a missing stamp with index.html, HTTP 200, so only a
# complete entry chunk counts), equal to each other, and each canonical homepage
# must serve exactly its host's stamp. A stale stamp or homepage is retried like
# any propagation delay, never failed at first sight.
#
# The one rule for what the live entry chunk is compared against (owner,
# 2026-11-22): EXPECTED_ENTRY_FILE, set by the workflow ONLY when this job
# actually published, names the published artifact's stamp, and every host's
# stamp and homepage must equal it. That catches a same-commit rebuild_live
# deploy while both hosts still serve the old build (their stamps and homepages
# agree with each other, but not with what was just published). When this job did
# not publish it is unset and only the hosts' stamps are compared with what they
# serve: a rerun job rebuilds with a different hash than what is live, so a
# locally built entry is never an expectation then.
entry_re='^src="/assets/[^"]*index-[A-Za-z0-9_-]+\.js"$'
expected=""
if [[ -n "${EXPECTED_ENTRY_FILE:-}" ]]; then
  expected="$(tr -d '[:space:]' <"$EXPECTED_ENTRY_FILE" 2>/dev/null || true)"
  [[ "$expected" =~ $entry_re ]] || {
    echo "EXPECTED_ENTRY_FILE '$EXPECTED_ENTRY_FILE' does not hold one complete entry chunk stamp" >&2
    exit 1
  }
fi
stamp_d=""
stamp_a=""
state_d=""
state_a=""
home_d=""
home_a=""
for ((attempt = 1; attempt <= tries; attempt += 1)); do
  read_stamp "$domain" "$attempt"
  stamp_d="$STAMP"
  state_d="$STAMP_STATE"
  read_stamp "$alias_url" "$attempt"
  stamp_a="$STAMP"
  state_a="$STAMP_STATE"
  home_d="$(entry "$domain/")"
  home_a="$(entry "$alias_url/")"
  if [[ -n "$stamp_d" && "$stamp_d" == "$stamp_a" && "$home_d" == "$stamp_d" && "$home_a" == "$stamp_d" && (-z "$expected" || "$stamp_d" == "$expected") ]]; then
    break
  fi
  echo "attempt $attempt: $domain stamp=$stamp_d($state_d) homepage=$home_d; $alias_url stamp=$stamp_a($state_a) homepage=$home_a${expected:+; published=$expected}"
  if ((attempt < tries)); then sleep "$pause"; fi
done

# A stamp that could not be read at all says nothing about the deployment:
# retry verify, do not republish (Vercel's daily deploy quota).
for pair in "$domain|$state_d" "$alias_url|$state_a"; do
  [[ "${pair#*|}" != transport ]] || {
    echo "${pair%%|*}/build-entry.txt could not be read (timeout, connection failure or HTTP 5xx). This is a transport error, not a stale build: rerun the verify step; do not rebuild or republish." >&2
    exit 2
  }
done
for pair in "$domain|$stamp_d" "$alias_url|$stamp_a"; do
  [[ -n "${pair#*|}" ]] || {
    echo "${pair%%|*} has no build-entry.txt stamp, so its homepage cannot be checked against the build. This deployment predates the stamp: rerun with rebuild_live=true to rebuild and republish it." >&2
    exit 1
  }
done
[[ "$stamp_d" == "$stamp_a" && "$home_d" == "$stamp_d" && "$home_a" == "$stamp_d" ]] || {
  echo "entry chunk mismatch: $domain stamp '$stamp_d' homepage '$home_d'; $alias_url stamp '$stamp_a' homepage '$home_a'. The hosts do not serve one build, or a stale homepage is still being served. Rerun with rebuild_live=true to republish." >&2
  exit 1
}
[[ -z "$expected" || "$stamp_d" == "$expected" ]] || {
  echo "entry chunk mismatch: both hosts serve '$stamp_d' but this job published '$expected'. The hosts still serve the previous build. Rerun the verify step, or rerun with rebuild_live=true if it persists." >&2
  exit 1
}
public="$stamp_d"

echo "Verified: $domain and $alias_url serve $public built from $commit_sha"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "- myk9show.com serves \`$public\` built from \`$commit_sha\`" >>"$GITHUB_STEP_SUMMARY"
fi
