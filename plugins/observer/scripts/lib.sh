#!/usr/bin/env bash
# Shared logging for observer hook scripts.
#
# Logging never touches stdout or stderr, so hooks keep both channels for
# talking to Claude Code. A logging failure is ignored so it can't break a hook.
#
# warden_log_init <name>
#   Sets the log file to ~/.claude-warden/<name>.log. All projects share it,
#   so each line is tagged with the project folder's name.
# warden_log <message...>
#   Appends one timestamped line to that log file.

warden_log_init() {
  WARDEN_LOG_NAME="$1"
  WARDEN_PROJECT="$(basename "${CLAUDE_PROJECT_DIR:-$PWD}")"
  local dir="$HOME/.claude-warden"
  WARDEN_LOG_FILE="$dir/$1.log"
  mkdir -p "$dir" 2>/dev/null || WARDEN_LOG_FILE=/dev/null
}

warden_log() {
  printf '%s [%s] [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${WARDEN_PROJECT:-unknown}" "${WARDEN_LOG_NAME:-observer}" "$*" \
    >>"${WARDEN_LOG_FILE:-/dev/null}" 2>/dev/null || true
}
