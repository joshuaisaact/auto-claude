#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="${HOME}/.claude/skills"
INSTALL_DIR="${SKILL_DIR}/autoresearch"

if [ -d "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  if [ -L "$INSTALL_DIR" ]; then
    target=$(readlink -f "$INSTALL_DIR")
    cd "$target" && git pull
  else
    cd "$INSTALL_DIR" && git pull
  fi
else
  echo "Installing autoresearch skill..."
  mkdir -p "$SKILL_DIR"
  git clone https://github.com/joshuaisaact/auto-claude.git "$INSTALL_DIR"
fi

echo "Installed to $INSTALL_DIR"
echo "Use /autoresearch in any Claude Code session."
