#!/usr/bin/env bash
input=$(cat)
cwd=$(jq -r '.cwd' <<<"$input")

echo "== Skills =="
for d in ~/.claude/skills/*/ "$cwd"/.claude/skills/*/; do
  [ -f "$d/SKILL.md" ] && echo "  $(basename "$d")"
done

echo "== Enabled plugins =="
jq -r '.enabledPlugins // {} | to_entries[] | select(.value) | "  \(.key)"' \
  ~/.claude/settings.json "$cwd"/.claude/settings*.json 2>/dev/null | sort -u

echo "== Plugin skills =="
jq -r '.plugins // {} | .[] | .[]?.installPath // empty' \
  ~/.claude/plugins/installed_plugins.json 2>/dev/null |
while read -r p; do
  for s in "$p"/skills/*/; do [ -d "$s" ] && echo "  $(basename "$p"):$(basename "$s")"; done
done

echo "== MCP servers =="
jq -r --arg c "$cwd" '(.mcpServers // {} | keys[]), (.projects[$c].mcpServers // {} | keys[])' \
  ~/.claude.json 2>/dev/null
jq -r '.mcpServers // {} | keys[]' "$cwd/.mcp.json" 2>/dev/null