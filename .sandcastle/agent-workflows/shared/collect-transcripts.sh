#!/usr/bin/env bash
# Copies the Claude Code session transcripts of this run into a folder for
# upload, with every secret the workflow holds replaced by ***.
# Usage: collect-transcripts.sh <out-dir>
#
# The run log shows each tool call but not its result. The transcript has
# both, which is what a retro needs to see why the agent did what it did.
#
# GitHub masks secrets in run logs, not in artifacts, and on a public repo
# anyone can download an artifact. So this script redacts the secrets itself,
# reading them from REDACT_* environment variables.
set -euo pipefail

out=$1
src="$HOME/.claude/projects"
mkdir -p "$out"

if [ ! -d "$src" ]; then
  echo "No transcripts at $src."
  exit 0
fi

cp -R "$src/." "$out/"

# Each secret's value, passed in env so it never appears on a command line.
for name in $(compgen -e | grep '^REDACT_' || true); do
  value=${!name}
  [ -n "$value" ] || continue
  SECRET="$value" find "$out" -type f -exec perl -pi -e \
    'BEGIN { $s = quotemeta $ENV{SECRET} } s/$s/***/g' {} +
done

echo "Collected $(find "$out" -name '*.jsonl' | wc -l) transcript(s)."
