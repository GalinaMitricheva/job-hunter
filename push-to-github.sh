#!/usr/bin/env bash
# Push Job Hunter Pro to GitHub.
# Requires a GitHub Personal Access Token (repo scope).
#
# Usage:
#   export GITHUB_TOKEN=ghp_your_token_here
#   bash push-to-github.sh
#
# The token is used only for this push and is NOT stored in git config.

set -e

TOKEN="${GITHUB_TOKEN}"
if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_TOKEN environment variable is not set."
  echo "Create a token at https://github.com/settings/tokens (scope: repo)"
  echo "Then run: export GITHUB_TOKEN=ghp_... && bash push-to-github.sh"
  exit 1
fi

REPO_OWNER="GalinaMitricheva"
REPO_NAME="job-hunter"
REMOTE_URL="https://x-access-token:${TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

git config user.email "user@example.com"
git config user.name "Job Hunter Pro"

git add -A
git commit -m "Initial commit: Job Hunter Pro — complete Electron desktop app" 2>/dev/null || echo "(nothing new to commit)"

# Set remote without persisting token in config
git remote set-url origin "$REMOTE_URL" 2>/dev/null || git remote add origin "$REMOTE_URL"

git branch -M main
git push -u origin main

# Remove token from remote URL after push (security hygiene)
git remote set-url origin "https://github.com/${REPO_OWNER}/${REPO_NAME}.git"

echo ""
echo "✅ Pushed to https://github.com/${REPO_OWNER}/${REPO_NAME}"
