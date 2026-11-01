#!/usr/bin/env bash
# MYK9-1623: keep Linux from handing Supabase's fixed host ports (supabase/config.toml)
# to an outbound connection as its ephemeral source port. The default range
# (32768-60999) contains 54320-54329, so an image pull can take 54322 before the
# database container binds it ("address already in use"). Reserving the ports
# removes them from the ephemeral pool; explicit binds still work.
#
# Test seams: SUPABASE_CONFIG (config path), SYSCTL_BIN (sysctl stub), SUDO ("" = no sudo).
set -euo pipefail

RESERVE_LO=54320
RESERVE_HI=54329
config="${SUPABASE_CONFIG:-supabase/config.toml}"
sysctl_bin="${SYSCTL_BIN:-sysctl}"
sudo_bin="${SUDO-sudo}"
key="net.ipv4.ip_local_reserved_ports"

[[ -f "$config" ]] || { echo "::error::reserve-supabase-ports: $config not found" >&2; exit 1; }

# Uncommented `port = N` and `*_port = N` lines.
ports="$(sed -E -n 's/^[[:space:]]*([A-Za-z0-9_]*port)[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*(#.*)?$/\2/p' "$config")"
[[ -n "$ports" ]] || { echo "::error::reserve-supabase-ports: no ports found in $config" >&2; exit 1; }

outside=""
for p in $ports; do
  if (( p < RESERVE_LO || p > RESERVE_HI )); then outside="$outside $p"; fi
done
if [[ -n "$outside" ]]; then
  echo "::error::reserve-supabase-ports: configured port(s)$outside in $config fall outside the reserved range $RESERVE_LO-$RESERVE_HI; widen the range in scripts/ci/reserve-supabase-ports.sh" >&2
  exit 1
fi

range="$RESERVE_LO-$RESERVE_HI"
current="$("$sysctl_bin" -n "$key" 2>/dev/null || true)"
current="${current//[[:space:]]/}"
case ",$current," in
  *",$range,"*) echo "Ports $range already reserved ($key=$current)"; exit 0 ;;
esac
if [[ -n "$current" ]]; then new="$current,$range"; else new="$range"; fi

$sudo_bin "$sysctl_bin" -w "$key=$new"
echo "Reserved Supabase ports $range ($key=$new)"
