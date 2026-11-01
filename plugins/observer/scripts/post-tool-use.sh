#!/usr/bin/env bash
# PostToolUse hook for the observer plugin.
# Claude Code sends the hook event as JSON on stdin.
set -euo pipefail

input="$(cat)"

# Placeholder: replace with real observability logic.
echo "observer: PostToolUse hook fired"
