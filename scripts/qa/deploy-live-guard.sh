#!/usr/bin/env bash
# Refuses a "Deploy myK9Show" commit that would roll production back (MYK9-2240).
#
# A pinned commit_sha used to ship whenever main's CI on it was green, even when
# production already served something newer (another session's deploy landed,
# or was queued, first). This reads the commit production serves from
# build-sha.txt, which every deploy stamps and verifies, and:
#
#   live is the deploy commit         -> action=skip   (nothing to deploy, exit 0)
#   live is an ancestor of it         -> action=deploy (exit 0)
#   live is not an ancestor of it     -> refused, names both commits (exit 1)
#   live unreadable / not a SHA / not
#   in this checkout's history        -> refused, never guesses (exit 1)
#
# Both production hosts are read: myk9show.com can lag the default alias
# (MYK9-546), and a deploy whose verify step failed may still have published.
# Every host must be contained in the deploy commit; it is a no-op only when
# every host already serves it.
#
# The workflow runs this twice inside its `deploy-myk9show` concurrency group,
# which lets only one run execute at a time: in preflight (so a no-op skips the
# build) and again immediately before `vercel deploy`.
#
#   COMMIT_SHA        required, full 40-char SHA about to be deployed
#   LIVE_SHA_URLS     space-separated build-sha.txt URLs (default: both hosts)
#   LIVE_READ_TRIES   attempts per URL before giving up (default 3)
#   LIVE_READ_SLEEP   seconds between attempts (default 5)
#
# Needs curl and a checkout whose history contains the live commit(s).
# Writes action=deploy|skip to $GITHUB_OUTPUT and a line to $GITHUB_STEP_SUMMARY
# when those are set; always logs to stdout.
set -euo pipefail

commit_sha="${COMMIT_SHA:-}"
urls="${LIVE_SHA_URLS:-https://myk9show.com/build-sha.txt https://myk9-platform-myk9show.vercel.app/build-sha.txt}"
tries="${LIVE_READ_TRIES:-3}"
pause="${LIVE_READ_SLEEP:-5}"

[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "COMMIT_SHA must be a full 40-character SHA (got '$commit_sha')" >&2
  exit 1
}

describe() {
  local subject
  subject="$(git log -1 --format=%s "$1" 2>/dev/null || true)"
  if [[ -n "$subject" ]]; then echo "$1 ($subject)"; else echo "$1"; fi
}

# Prints the 40-hex SHA a host serves, or nothing. Cache-busted per attempt; a
# missing file comes back as the SPA's index.html, which the regex rejects.
read_live() {
  local url="$1" attempt body
  for ((attempt = 1; attempt <= tries; attempt += 1)); do
    body="$(curl --fail --silent --show-error --location --max-time 20 \
      "$url?v=$commit_sha-$(date +%s)-$attempt" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ "$body" =~ ^[0-9a-f]{40}$ ]]; then
      echo "$body"
      return 0
    fi
    echo "attempt $attempt: $url returned '${body:0:60}'" >&2
    if ((attempt < tries)); then sleep "$pause"; fi
  done
}

all_equal=1
for url in $urls; do
  live="$(read_live "$url" || true)"
  [[ -n "$live" ]] || {
    echo "Could not read the live commit from $url; refusing to deploy $commit_sha without knowing what production serves. Fix the site first (Vercel's Instant Rollback restores the previous deployment), then rerun." >&2
    exit 1
  }
  git cat-file -e "$live^{commit}" 2>/dev/null || {
    echo "$url serves $live, which is not in this checkout's history; refusing to guess whether $commit_sha contains it." >&2
    exit 1
  }
  echo "Live: $url serves $(describe "$live")"
  if [[ "$live" == "$commit_sha" ]]; then
    continue
  fi
  all_equal=0
  rc=0
  git merge-base --is-ancestor "$live" "$commit_sha" || rc=$?
  if [[ $rc -eq 1 ]]; then
    echo "Refusing to roll production back: $url serves $(describe "$live"), which $(describe "$commit_sha") does not contain. Deploy a main commit that contains $live (or leave commit_sha blank for the newest green one)." >&2
    exit 1
  elif [[ $rc -ne 0 ]]; then
    echo "git merge-base failed (status $rc) comparing $live with $commit_sha; refusing to guess." >&2
    exit 1
  fi
done

if [[ $all_equal -eq 1 ]]; then
  action=skip
  echo "Nothing to deploy: production already serves $(describe "$commit_sha")"
else
  action=deploy
  echo "Live check passed: $commit_sha contains every commit production serves"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "action=$action" >>"$GITHUB_OUTPUT"
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  if [[ $action == skip ]]; then
    echo "- Nothing to deploy: production already serves \`$commit_sha\`" >>"$GITHUB_STEP_SUMMARY"
  else
    echo "- Live check: \`$commit_sha\` contains what production serves" >>"$GITHUB_STEP_SUMMARY"
  fi
fi
