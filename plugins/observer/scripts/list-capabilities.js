#!/usr/bin/env node
'use strict';
// SessionStart hook (JavaScript version of list-capabilities.sh).
// Its stdout is added to Claude's context, so the capability listing below
// is printed with console.log on purpose. Needs only Node, not jq.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { wardenLogInit, wardenLog } = require('./lib.js');

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Sorted entries of dir whose names match pattern (hidden ones skipped, like a shell glob).
function list(dir, pattern = /^[^.]/) {
  try {
    return fs.readdirSync(dir).filter((n) => pattern.test(n)).sort().map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

// Resolved, symlink-free form of p (falls back to a plain resolve if it doesn't exist).
function realPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

const subdirs = (dir) => list(dir).filter(isDir);
const hasSkill = (dir) => isFile(path.join(dir, 'SKILL.md'));
const sorted = (set) => [...set].sort();
const mcpServers = (o) => (isObject(o) && isObject(o.mcpServers) ? Object.keys(o.mcpServers).sort() : []);

function main() {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    // No or bad input: fall back to the current folder.
  }
  wardenLog('observer: SessionStart hook fired');

  const cwd = (isObject(input) && input.cwd) || process.cwd();
  const home = os.homedir();
  const out = [];

  out.push('== Skills ==');
  for (const d of [...subdirs(path.join(home, '.claude/skills')), ...subdirs(path.join(cwd, '.claude/skills'))]) {
    if (hasSkill(d)) out.push(`  ${path.basename(d)}`);
  }

  out.push('== Enabled plugins ==');
  const enabled = new Set();
  const settingsFiles = [
    path.join(home, '.claude/settings.json'),
    ...list(path.join(cwd, '.claude'), /^settings.*\.json$/),
  ];
  for (const file of settingsFiles) {
    const plugins = readJson(file)?.enabledPlugins;
    if (!isObject(plugins)) continue;
    for (const [key, on] of Object.entries(plugins)) {
      if (on !== false && on != null) enabled.add(`  ${key}`);
    }
  }
  out.push(...sorted(enabled));

  // Installed plugins: name (without "@marketplace") and install folder.
  const plugins = [];
  const installed = readJson(path.join(home, '.claude/plugins/installed_plugins.json'))?.plugins;
  if (isObject(installed)) {
    for (const [key, entries] of Object.entries(installed)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && typeof entry.installPath === 'string' && entry.installPath) {
          plugins.push({ name: key.replace(/@[^@]*$/, ''), dir: entry.installPath });
        }
      }
    }
  }

  // A plugin's skills and hooks are in its default folders (skills/, hooks/hooks.json)
  // plus any paths its plugin.json lists under "skills" or "hooks".
  const manifest = (dir) => readJson(path.join(dir, '.claude-plugin/plugin.json'));
  const manifestPaths = (dir, field) => {
    const value = manifest(dir)?.[field];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
    return [];
  };
  const resolveIn = (dir, rel) => path.join(dir, rel.replace(/^\.\//, ''));

  out.push('== Plugin skills ==');
  const pluginSkills = new Set();
  for (const { name, dir } of plugins) {
    for (const rel of ['skills', ...manifestPaths(dir, 'skills')]) {
      const d = resolveIn(dir, rel);
      // A path can be one skill folder or a folder of skill folders.
      const skills = hasSkill(d) ? [d] : subdirs(d).filter(hasSkill);
      for (const s of skills) pluginSkills.add(`  ${name}:${path.basename(s)}`);
    }
  }
  out.push(...sorted(pluginSkills));

  out.push('== Plugin hooks ==');
  for (const { name, dir } of plugins) {
    const events = new Set();
    for (const rel of ['hooks/hooks.json', ...manifestPaths(dir, 'hooks')]) {
      const hooks = readJson(resolveIn(dir, rel))?.hooks;
      if (isObject(hooks)) Object.keys(hooks).forEach((e) => events.add(e));
    }
    // Hooks can also be written inline in plugin.json.
    const inline = manifest(dir)?.hooks;
    if (isObject(inline)) {
      const hooks = inline.hooks ?? inline;
      if (isObject(hooks)) Object.keys(hooks).forEach((e) => events.add(e));
    }
    if (events.size) out.push(`  ${name}: ${sorted(events).join(', ')}`);
  }

  out.push('== MCP servers ==');
  const claudeJson = readJson(path.join(home, '.claude.json'));
  // Match the project entry by real path, so a trailing slash or symlink in cwd
  // (or in the stored key) still finds it.
  const projects = isObject(claudeJson?.projects) ? claudeJson.projects : {};
  const cwdReal = realPath(cwd);
  const projectKey = cwd in projects ? cwd : Object.keys(projects).find((k) => realPath(k) === cwdReal);
  out.push(
    ...mcpServers(claudeJson),
    ...mcpServers(projectKey === undefined ? null : projects[projectKey]),
    ...mcpServers(readJson(path.join(cwd, '.mcp.json'))),
  );

  wardenLog(out.join('\n') + '\n');
}

wardenLogInit('session-start');
try {
  main();
} catch (err) {
  // Fail open: log the problem but never break the session.
  wardenLog(`observer: list-capabilities failed: ${err && err.message}`);
}
process.exitCode = 0;
