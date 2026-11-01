#!/usr/bin/env bash
# PostToolUse hook for the observer plugin.
# Claude Code sends the hook event as JSON on stdin.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
warden_log_to post-tool-use

input="$(cat)"

# Placeholder: replace with real observability logic.
echo "observer: PostToolUse hook fired"
