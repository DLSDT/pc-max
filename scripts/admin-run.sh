#!/usr/bin/env bash
#
# Run any PC MAX admin script with the admin password, prompted once.
#
#   ./scripts/admin-run.sh node apps/api/scripts/set-plan-prices.mjs --restore … --apply
#
# The password is read with `read -rs`, so it never reaches the shell history,
# never appears in `ps` output for the child process, and is not written to
# disk. It lives in one variable, is exported only into the command being run,
# and is unset when that command returns.
#
# Nothing here is specific to one script — the admin tools all read
# PCMAX_ADMIN_PASSWORD from the environment, so this wraps any of them.
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "usage: $0 <command…>" >&2
  echo "example: $0 node apps/api/scripts/register-release.mjs --exe … --apply" >&2
  exit 2
fi

# Read from the terminal rather than stdin, so this still works when the caller
# is piping something into the command being wrapped.
if [ -t 0 ]; then
  read -rsp 'admin password: ' PCMAX_ADMIN_PASSWORD < /dev/tty
  echo
else
  echo "$0 needs a terminal to prompt for the password." >&2
  exit 2
fi

if [ -z "${PCMAX_ADMIN_PASSWORD}" ]; then
  echo "No password entered — nothing run." >&2
  exit 2
fi

export PCMAX_ADMIN_PASSWORD
# `trap` rather than a trailing unset: the variable should go even if the
# wrapped command is interrupted half way through.
trap 'unset PCMAX_ADMIN_PASSWORD' EXIT

"$@"
