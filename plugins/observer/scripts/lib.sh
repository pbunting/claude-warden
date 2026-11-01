#!/usr/bin/env bash
# Shared setup for observer hook scripts.
#
# warden_log_to <name>
#   Creates .claude-warden/ in the project folder and sends all further
#   stdout and stderr from the calling script to .claude-warden/<name>.log.
warden_log_to() {
  local dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude-warden"
  mkdir -p "$dir"
  exec >>"$dir/$1.log" 2>&1
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
}
