#!/usr/bin/env bash
# SessionStart hook. Its stdout is added to Claude's context, so the
# capability listing below is printed with echo on purpose.
source "$(dirname "$0")/lib.sh"
warden_log_init session-start

input=$(cat)
warden_log "observer: SessionStart hook fired"
cwd=$(jq -r '.cwd' <<<"$input")

echo "== Skills =="
for d in ~/.claude/skills/*/ "$cwd"/.claude/skills/*/; do
  [ -f "$d/SKILL.md" ] && echo "  $(basename "$d")"
done

echo "== Enabled plugins =="
jq -r '.enabledPlugins // {} | to_entries[] | select(.value) | "  \(.key)"' \
  ~/.claude/settings.json "$cwd"/.claude/settings*.json 2>/dev/null | sort -u

# Installed plugins, one "<name>@<marketplace><TAB><install path>" per line.
plugins=$(jq -r '.plugins // {} | to_entries[] | .key as $k | .value[]? | "\($k)\t\(.installPath // empty)"' \
  ~/.claude/plugins/installed_plugins.json 2>/dev/null)

# A plugin's skills and hooks are in its default folders (skills/, hooks/hooks.json)
# plus any paths its plugin.json lists under "skills" or "hooks".
# manifest_paths <install path> <field> prints that field's path(s), one per line.
manifest_paths() {
  jq -r --arg f "$2" '.[$f] | if type == "string" then . elif type == "array" then .[] | strings else empty end' \
    "$1/.claude-plugin/plugin.json" 2>/dev/null
}

echo "== Plugin skills =="
while IFS=$'\t' read -r key p; do
  [ -n "$p" ] || continue
  { echo skills; manifest_paths "$p" skills; } | while read -r rel; do
    d="$p/${rel#./}"
    # A path can be one skill folder or a folder of skill folders.
    if [ -f "$d/SKILL.md" ]; then
      echo "  ${key%@*}:$(basename "$d")"
    else
      for s in "$d"/*/; do [ -f "$s/SKILL.md" ] && echo "  ${key%@*}:$(basename "$s")"; done
    fi
  done
done <<<"$plugins" | sort -u

echo "== Plugin hooks =="
while IFS=$'\t' read -r key p; do
  [ -n "$p" ] || continue
  events=$(
    { echo hooks/hooks.json; manifest_paths "$p" hooks; } | while read -r rel; do
      jq -r '.hooks // {} | keys[]' "$p/${rel#./}" 2>/dev/null
    done
    # Hooks can also be written inline in plugin.json.
    jq -r '.hooks | objects | (.hooks // .) | keys[]' "$p/.claude-plugin/plugin.json" 2>/dev/null
  )
  [ -n "$events" ] && echo "  ${key%@*}: $(sort -u <<<"$events" | paste -sd, - | sed 's/,/, /g')"
done <<<"$plugins"

echo "== MCP servers =="
jq -r --arg c "$cwd" '(.mcpServers // {} | keys[]), (.projects[$c].mcpServers // {} | keys[])' \
  ~/.claude.json 2>/dev/null
jq -r '.mcpServers // {} | keys[]' "$cwd/.mcp.json" 2>/dev/null
exit 0
