#!/usr/bin/env bash
#
# One-time GitHub setup so tagging a release registers it by itself.
#
#   ./scripts/github-setup.sh
#
# Signs in to GitHub (if needed) and stores the admin password as the repo
# secret the release workflow reads. Without it, `Register release with the
# update server` cannot run: the tag publishes an installer that no existing
# install is ever offered.
#
# Both steps prompt. The password is typed into `gh`, which encrypts it locally
# before it is sent — it is never passed as an argument, so it stays out of the
# shell history and out of `ps`.
set -euo pipefail

REPO=DLSDT/pc-max
SECRET=PCMAX_ADMIN_PASSWORD

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is not on PATH. Install it, or re-run the installer step." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Signing in to GitHub — a browser will open with a one-time code."
  echo
  # ssh: the remote already uses it, so this leaves git alone.
  # skip-ssh-key: a key is already set up; there is nothing to upload.
  gh auth login --hostname github.com --git-protocol ssh --skip-ssh-key --web
  echo
fi

echo "Now paste the PC MAX admin password. It is encrypted locally before it leaves this machine."
gh secret set "$SECRET" --repo "$REPO"

echo
echo "Secrets on $REPO:"
gh secret list --repo "$REPO"
echo
echo "Done. The next tag registers its own release."
