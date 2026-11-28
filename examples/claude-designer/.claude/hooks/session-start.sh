#!/bin/bash
# Installs FigCraft's figcraft-cli and figdiff when a Claude Code cloud session starts,
# so Claude can edit .figcraft files and check its own changes.
#
# figcraft-cli comes only from the official FigCraft release on GitHub
# (github.com/storytold/figcraft), checked against the release's sha256sums.txt.
# Set FIGCRAFT_VERSION (for example 0.18.1) to pin a version; the default is the
# newest release, the same one the figdiff Action renders with.
set -euo pipefail

# Only in cloud sessions. On your own computer, install FigCraft yourself.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

FIGCRAFT_REPO="https://github.com/storytold/figcraft"
PREFIX="${FIGCRAFT_PREFIX:-$HOME/.local/figcraft}"
FIGDIFF_PREFIX="${FIGDIFF_PREFIX:-$HOME/.local/figdiff}"
FIGDIFF_VERSION="${FIGDIFF_VERSION:-latest}"

log() { echo "[figcraft setup] $*" >&2; }

# Which FigCraft version? The release API is not reachable from every cloud session,
# so read the tags over git, which is.
version="${FIGCRAFT_VERSION:-}"
if [ -z "$version" ]; then
  version="$(git ls-remote --tags --refs "$FIGCRAFT_REPO" 2>/dev/null \
    | sed -n 's#.*refs/tags/v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$#\1#p' \
    | sort -V | tail -n 1 || true)"
fi
installed="$(cat "$PREFIX/VERSION" 2>/dev/null || true)"
if [ -z "$version" ]; then
  if [ -n "$installed" ]; then
    log "could not look up the newest FigCraft release; keeping $installed"
    version="$installed"
  else
    log "could not look up the newest FigCraft release; figcraft-cli is not installed"
    exit 0
  fi
fi

if [ "$installed" != "$version" ] || [ ! -x "$PREFIX/bin/figcraft-cli" ]; then
  log "installing figcraft-cli $version"
  asset="figcraft-$version-linux-x86_64.tar.gz"
  base="$FIGCRAFT_REPO/releases/download/v$version"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/$asset" "$base/$asset"
  curl -fsSL --retry 3 -o "$tmp/sha256sums.txt" "$base/sha256sums.txt"
  # Keep only the line for this exact file name, then check it.
  awk -v f="$asset" '$2 == f' "$tmp/sha256sums.txt" > "$tmp/check.txt"
  if [ ! -s "$tmp/check.txt" ]; then
    log "$asset is not listed in the release's sha256sums.txt; not installing"
    exit 1
  fi
  (cd "$tmp" && sha256sum --check --status check.txt) || { log "checksum mismatch for $asset; not installing"; exit 1; }
  mkdir -p "$tmp/x"
  tar -xzf "$tmp/$asset" -C "$tmp/x"
  cli="$(find "$tmp/x" -type f -name figcraft-cli | head -n 1)"
  if [ -z "$cli" ]; then
    log "figcraft-cli was not found in $asset"
    exit 1
  fi
  rm -rf "$PREFIX"
  mkdir -p "$(dirname "$PREFIX")"
  mv "$(dirname "$(dirname "$cli")")" "$PREFIX"
  echo "$version" > "$PREFIX/VERSION"
fi

# figdiff, to read Claude's own changes before it opens a pull request.
if [ ! -x "$FIGDIFF_PREFIX/node_modules/.bin/figdiff" ] && command -v npm >/dev/null; then
  log "installing figdiff@$FIGDIFF_VERSION"
  npm install --prefix "$FIGDIFF_PREFIX" --no-audit --no-fund --silent "figdiff@$FIGDIFF_VERSION"
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PATH=\"$PREFIX/bin:$FIGDIFF_PREFIX/node_modules/.bin:\$PATH\""
    echo "export FIGCRAFT_CLI=\"$PREFIX/bin/figcraft-cli\""
  } >> "$CLAUDE_ENV_FILE"
fi
log "ready: $("$PREFIX/bin/figcraft-cli" --version)"
