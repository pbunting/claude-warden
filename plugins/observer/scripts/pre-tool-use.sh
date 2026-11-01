#!/usr/bin/env bash
# PreToolUse hook for the observer plugin.
# Claude Code sends the hook event as JSON on stdin.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
warden_log_init pre-tool-use

input="$(cat)"

# Placeholder: replace with real observability logic.
warden_log "observer: PreToolUse hook fired"
